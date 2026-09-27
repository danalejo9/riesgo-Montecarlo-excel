/**
 * El pool de hilos del motor (`engine/executor/pool.ts`), probado con hilos de
 * mentira que atienden los mensajes con el mismo `crearAtendedor` que usan los
 * Web Workers del panel. Lo que se comprueba es el protocolo: que el modelo
 * viaja una vez, que los resultados se colocan en su sitio aunque lleguen
 * desordenados, y que un fallo se nota.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import {
  compensanHilos, crearAtendedor, crearPool, particionarEnBloques, simularPorBloques,
  type CanalHilo, type ContextoHilo, type DefinicionEntrada, type MensajeAlHilo, type MensajeDelHilo,
} from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);
const SEED = 777;

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

/** Un hilo de mentira: responde en un turno posterior, con retraso variable. */
function hiloFalso(retraso: number, registro: MensajeAlHilo[]): CanalHilo & { cerrado: boolean } {
  const atender = crearAtendedor();
  const canal = {
    cerrado: false,
    onmessage: null as CanalHilo['onmessage'],
    onerror: null as CanalHilo['onerror'],
    postMessage(m: MensajeAlHilo) {
      registro.push(m);
      // structuredClone: lo que cruza entre hilos es una copia, como en un Worker.
      const copia = structuredClone(m);
      setTimeout(() => {
        const r = atender(copia);
        if (r) canal.onmessage?.({ data: structuredClone(r.respuesta) as MensajeDelHilo });
      }, retraso);
    },
    terminate() { canal.cerrado = true; },
  };
  return canal;
}

const g = grafoDe({ C1: 'A1*3+B1' });
const compilado = compilarPlan(g, new Set([k('A1'), k('B1')]), [k('C1')]);
if (!compilado.ok) throw new Error('no compiló');
const plan = compilado.plan;
const defs: DefinicionEntrada[] = [
  { tipo: 'distribucion', clave: k('A1'), id: 'a', distribucion: { tipo: 'normal', media: 10, desviacion: 2 }, metodo: 'monte-carlo' },
  { tipo: 'distribucion', clave: k('B1'), id: 'b', distribucion: { tipo: 'uniforme', min: 0, max: 5 }, metodo: 'monte-carlo' },
];
const contexto: ContextoHilo = { grafo: g, plan, entradas: defs, seed: SEED, compresionTDigest: 100, limiteMuestra: 3000 };

describe('crearPool', () => {
  it('da exactamente el mismo resultado que el ejecutor secuencial', async () => {
    const opciones = { bloquesMinimos: 16, retenerMuestra: 3000 };
    const secuencial = await simularPorBloques(g, plan, defs, SEED, 20_000, opciones);

    const registro: MensajeAlHilo[] = [];
    // Retrasos distintos: las respuestas llegan desordenadas.
    const hilos = [hiloFalso(3, registro), hiloFalso(0, registro), hiloFalso(1, registro)];
    const pool = crearPool(hilos, contexto);
    const paralelo = await simularPorBloques(g, plan, defs, SEED, 20_000, {
      ...opciones, ejecutor: pool.ejecutor, bloquesPorRonda: 6,
    });
    pool.cerrar();

    expect(secuencial.ok && paralelo.ok).toBe(true);
    if (!secuencial.ok || !paralelo.ok) return;
    const s = secuencial.porSalida.get(k('C1'));
    const p = paralelo.porSalida.get(k('C1'));
    expect(p?.welford).toEqual(s?.welford);
    expect(p?.digest).toEqual(s?.digest);
    expect(Array.from(p?.muestra ?? [])).toEqual(Array.from(s?.muestra ?? []));
    expect(hilos.every((h) => h.cerrado)).toBe(true);
  });

  it('el modelo viaja una sola vez por hilo; los trabajos solo llevan el rango', async () => {
    const registro: MensajeAlHilo[] = [];
    const pool = crearPool([hiloFalso(0, registro), hiloFalso(0, registro)], contexto);
    await pool.ejecutor.ejecutar(particionarEnBloques(8000, 1000));
    expect(registro.filter((m) => m.tipo === 'iniciar')).toHaveLength(2);
    const trabajos = registro.filter((m) => m.tipo === 'bloque');
    expect(trabajos).toHaveLength(8);
    for (const t of trabajos) expect(Object.keys(t).sort()).toEqual(['bloque', 'id', 'tipo']);
  });

  it('un error del modelo en un hilo llega como error de cálculo', async () => {
    const malo = grafoDe({ C1: 'A1/0' });
    const c = compilarPlan(malo, new Set([k('A1')]), [k('C1')]);
    if (!c.ok) throw new Error('no compiló');
    // Un hilo que responde con un error de cálculo.
    const canal: CanalHilo = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(m) {
        if (m.tipo === 'bloque') setTimeout(() => canal.onmessage?.({ data: { id: m.id, ok: false, error: { clave: 'Hoja1!C1', motivo: 'roto' } } }), 0);
      },
    };
    const pool = crearPool([canal], contexto);
    const r = await simularPorBloques(g, plan, defs, SEED, 5000, { ejecutor: pool.ejecutor });
    expect(r).toEqual({ ok: false, error: { clave: 'Hoja1!C1', motivo: 'roto' } });
  });

  it('un hilo que se cae rechaza la ronda, para que quien llama pueda recurrir al hilo principal', async () => {
    const canal: CanalHilo = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(m) {
        if (m.tipo === 'bloque') setTimeout(() => canal.onerror?.({ message: 'no se pudo cargar el script' }), 0);
      },
    };
    const pool = crearPool([canal], contexto);
    await expect(pool.ejecutor.ejecutar([{ inicio: 0, largo: 10 }])).rejects.toThrow('no se pudo cargar el script');
  });
});

describe('bloquesMinimos', () => {
  it('trocea diez mil iteraciones en varios bloques en vez de uno', async () => {
    const vistos: number[] = [];
    const espia = {
      ejecutar(trabajos: readonly { inicio: number; largo: number }[]) {
        vistos.push(...trabajos.map((t) => t.largo));
        const atender = crearAtendedor();
        atender({ tipo: 'iniciar', contexto });
        return trabajos.map((b, id) => {
          const r = atender({ tipo: 'bloque', id, bloque: b });
          if (!r?.respuesta.ok) throw new Error('falló');
          return r.respuesta.parcial;
        });
      },
    };
    await simularPorBloques(g, plan, defs, SEED, 10_000, { ejecutor: espia, bloquesMinimos: 16 });
    expect(vistos.length).toBeGreaterThanOrEqual(9); // bloques de al menos 1.024
    expect(vistos.reduce((a, b) => a + b, 0)).toBe(10_000);
  });
});

describe('compensanHilos (F4: núcleos en automático según el tamaño)', () => {
  const plan = (celdas: number, constantes = 0) => ({
    orden: Array.from({ length: celdas }, (_, i) => `H!A${i + 1}`),
    esConstante: new Set(Array.from({ length: constantes }, (_, i) => `H!A${i + 1}`)),
    salidas: [],
  });

  it('10.000 iteraciones del libro de demostración (70 celdas): un hilo, como se midió', () => {
    expect(compensanHilos(plan(70), 10_000)).toBe(false);
  });

  it('250.000 iteraciones del mismo libro: varios hilos', () => {
    expect(compensanHilos(plan(70), 250_000)).toBe(true);
  });

  it('las celdas constantes no cuentan: se calculan una vez', () => {
    expect(compensanHilos(plan(1000, 990), 100_000)).toBe(false);
    expect(compensanHilos(plan(1000, 0), 100_000)).toBe(true);
  });
});
