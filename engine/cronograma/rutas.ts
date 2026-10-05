/**
 * Diagnóstico de la ruta crítica (Gantt, §7): holgura de cada relación,
 * relaciones impulsoras, ruta más larga, ruta impulsora hacia una actividad,
 * cadenas aguas arriba y aguas abajo, y «¿por qué es crítica?». Sin Office.js.
 * Usa el mismo CPM del QRSA: no recalcula nada por su cuenta.
 *
 * - **Holgura de una relación**: cuánto le sobra a la sucesora respecto a lo
 *   que le exige esa relación, en días laborables de la sucesora. FC:
 *   `ES_suc − (EF_pred + desfase)`; CC: `ES_suc − (ES_pred + desfase)`; FF:
 *   `EF_suc − (EF_pred + desfase)`; CF: `EF_suc − (ES_pred + desfase)`.
 * - **Impulsora**: la relación con holgura 0, la que de verdad fija la fecha de
 *   la sucesora.
 * - **Ruta más larga**: desde las actividades que terminan con el proyecto,
 *   hacia atrás solo por relaciones impulsoras. Con restricciones o varios
 *   calendarios no coincide con «holgura total ≤ 0», y por eso están las dos.
 */

import { calcularCpm, crearEspacio, limiteRelacion, TOLERANCIA_CRITICA, type EspacioCpm, type OpcionesCpm } from './cpm.ts';
import type { RedCompilada, TipoRelacion } from './red.ts';
import type { CalendarioLaboral } from './calendario.ts';

const TIPOS: readonly TipoRelacion[] = ['FC', 'CC', 'FF', 'CF'];
const CODIGOS_RESTRICCION = ['', 'SNET', 'FNET', 'SNLT', 'FNLT', 'MSO', 'MFO'] as const;

export interface AnalisisRutas {
  esp: EspacioCpm;
  /** Por relación (índice de la red compilada): su holgura, en días laborables de la sucesora. */
  holguraRelacion: Float64Array;
  /** 1 si la relación es impulsora (holgura ≤ 0). */
  impulsora: Uint8Array;
  /** Por actividad y por relación: 1 si están en la ruta más larga. */
  rutaMasLarga: Uint8Array;
  relacionMasLarga: Uint8Array;
}

/** Calcula el CPM con las duraciones dadas y las rutas sobre él. */
export function analizarRutas(red: RedCompilada, duracion: Float64Array = red.duracion, opciones: OpcionesCpm = {}): AnalisisRutas {
  const esp = crearEspacio(red.n);
  calcularCpm(red, duracion, esp, { ...opciones, holguraLibre: true });
  const m = red.relPred.length;
  const holguraRelacion = new Float64Array(m);
  const impulsora = new Uint8Array(m);
  for (let r = 0; r < m; r++) {
    const s = red.relSuc[r] as number;
    const h = (esp.es[s] as number) - limiteRelacion(red, r, s, esp.dur[s] as number, esp.es, esp.ef);
    holguraRelacion[r] = h;
    impulsora[r] = h <= TOLERANCIA_CRITICA ? 1 : 0;
  }
  const rutaMasLarga = new Uint8Array(red.n);
  const relacionMasLarga = new Uint8Array(m);
  // Las que terminan con el proyecto.
  const pila: number[] = [];
  for (let a = 0; a < red.n; a++) {
    const c = red.calendarios[red.cal[a] as number] as CalendarioLaboral;
    // Termina justo con el proyecto (en su calendario).
    if (Math.abs(c.cuenta(esp.fin) - (esp.ef[a] as number)) <= TOLERANCIA_CRITICA) pila.push(a);
  }
  for (const a of pila) rutaMasLarga[a] = 1;
  while (pila.length) {
    const a = pila.pop() as number;
    for (let k = red.entradaInicio[a] as number; k < (red.entradaInicio[a + 1] as number); k++) {
      const r = red.relEntrada[k] as number;
      if (impulsora[r] !== 1) continue;
      relacionMasLarga[r] = 1;
      const p = red.relPred[r] as number;
      if (rutaMasLarga[p] !== 1) {
        rutaMasLarga[p] = 1;
        pila.push(p);
      }
    }
  }
  return { esp, holguraRelacion, impulsora, rutaMasLarga, relacionMasLarga };
}

/** La cadena impulsora que lleva hasta la actividad `a` (ella incluida): «¿qué controla esta fecha?». */
export function rutaImpulsoraHacia(red: RedCompilada, rutas: AnalisisRutas, a: number): { actividades: Set<number>; relaciones: Set<number> } {
  const actividades = new Set<number>([a]);
  const relaciones = new Set<number>();
  const pila = [a];
  while (pila.length) {
    const x = pila.pop() as number;
    for (let k = red.entradaInicio[x] as number; k < (red.entradaInicio[x + 1] as number); k++) {
      const r = red.relEntrada[k] as number;
      if (rutas.impulsora[r] !== 1) continue;
      relaciones.add(r);
      const p = red.relPred[r] as number;
      if (!actividades.has(p)) {
        actividades.add(p);
        pila.push(p);
      }
    }
  }
  return { actividades, relaciones };
}

/** Todas las predecesoras (aguas arriba) o sucesoras (aguas abajo) de `a`, por cualquier relación. */
export function cadena(red: RedCompilada, a: number, sentido: 'arriba' | 'abajo'): { actividades: Set<number>; relaciones: Set<number> } {
  const actividades = new Set<number>([a]);
  const relaciones = new Set<number>();
  const pila = [a];
  const [inicio, lista, otro] = sentido === 'arriba' ? [red.entradaInicio, red.relEntrada, red.relPred] : [red.salidaInicio, red.relSalida, red.relSuc];
  while (pila.length) {
    const x = pila.pop() as number;
    for (let k = inicio[x] as number; k < (inicio[x + 1] as number); k++) {
      const r = lista[k] as number;
      relaciones.add(r);
      const y = otro[r] as number;
      if (!actividades.has(y)) {
        actividades.add(y);
        pila.push(y);
      }
    }
  }
  return { actividades, relaciones };
}

export interface ExplicacionCritica {
  critica: boolean;
  holgura: number;
  /** Las relaciones que fijan su inicio (impulsoras); vacío si la fija el inicio del proyecto o una restricción. */
  impulsadaPor: { id: string; tipo: TipoRelacion; desfase: number }[];
  /** Si no tiene predecesora impulsora: qué fija su inicio. */
  inicioPor: 'proyecto' | 'restriccion' | 'relacion';
  /** Las sucesoras a las que impulsa (consumen su holgura). */
  impulsaA: { id: string; tipo: TipoRelacion; desfase: number; holgura: number }[];
  /** Su restricción o fecha límite, si la tiene. */
  restriccion: string | null;
  /** Con holgura negativa: las restricciones o fechas límite aguas abajo que la causan. */
  causasNegativa: string[];
  /** En una frase. */
  texto: string;
}

/** «¿Por qué es crítica esta actividad?» (§7.3). */
export function porQueCritica(red: RedCompilada, rutas: AnalisisRutas, a: number, nombreDe: (i: number) => string = (i) => red.ids[i] as string): ExplicacionCritica {
  const { esp, impulsora } = rutas;
  const holgura = esp.holgura[a] as number;
  const critica = holgura <= TOLERANCIA_CRITICA;
  const impulsadaPor: ExplicacionCritica['impulsadaPor'] = [];
  for (let k = red.entradaInicio[a] as number; k < (red.entradaInicio[a + 1] as number); k++) {
    const r = red.relEntrada[k] as number;
    if (impulsora[r]) impulsadaPor.push({ id: red.ids[red.relPred[r] as number] as string, tipo: TIPOS[red.relTipo[r] as number] as TipoRelacion, desfase: red.relDesfase[r] as number });
  }
  const impulsaA: ExplicacionCritica['impulsaA'] = [];
  for (let k = red.salidaInicio[a] as number; k < (red.salidaInicio[a + 1] as number); k++) {
    const r = red.relSalida[k] as number;
    if (impulsora[r]) {
      impulsaA.push({ id: red.ids[red.relSuc[r] as number] as string, tipo: TIPOS[red.relTipo[r] as number] as TipoRelacion, desfase: red.relDesfase[r] as number, holgura: esp.holgura[red.relSuc[r] as number] as number });
    }
  }
  const textoRestriccion = (i: number): string | null => {
    const partes: string[] = [];
    const t = red.resTipo[i] as number;
    if (t) partes.push(CODIGOS_RESTRICCION[t] as string);
    if ((red.limite[i] as number) === (red.limite[i] as number)) partes.push('fecha límite');
    return partes.length ? partes.join(' y ') : null;
  };
  const restriccion = textoRestriccion(a);
  let inicioPor: ExplicacionCritica['inicioPor'] = 'relacion';
  if (impulsadaPor.length === 0) {
    const t = red.resTipo[a] as number;
    inicioPor = t === 1 || t === 5 || t === 2 || t === 6 ? 'restriccion' : 'proyecto';
  }
  const causasNegativa: string[] = [];
  if (holgura < -TOLERANCIA_CRITICA) {
    const abajo = cadena(red, a, 'abajo');
    for (const x of abajo.actividades) {
      const t = textoRestriccion(x);
      const dura = t !== null && ((red.resTipo[x] as number) >= 3 || t.includes('fecha límite'));
      if (dura && (esp.holgura[x] as number) < -TOLERANCIA_CRITICA) causasNegativa.push(`${nombreDe(x)} (${t})`);
    }
  }
  const quien = impulsadaPor.length
    ? `Su inicio lo fija ${impulsadaPor.map((p) => `${p.id} (${p.tipo}${p.desfase ? `${p.desfase > 0 ? '+' : ''}${p.desfase}d` : ''})`).join(' y ')}`
    : inicioPor === 'restriccion' ? `Su inicio lo fija su restricción (${restriccion})` : 'Empieza con el proyecto';
  const aQuien = impulsaA.length ? `; a su vez fija el inicio de ${impulsaA.map((s) => s.id).join(', ')}` : '; no fija el inicio de ninguna sucesora';
  const estado = holgura < -TOLERANCIA_CRITICA
    ? `Tiene holgura negativa (${Math.round(holgura * 100) / 100} días)${causasNegativa.length ? ` por ${causasNegativa.join(', ')}` : ''}.`
    : critica ? 'No tiene holgura: cualquier retraso mueve el fin del proyecto.' : `Tiene ${Math.round(holgura * 100) / 100} días de holgura.`;
  return { critica, holgura, impulsadaPor, inicioPor, impulsaA, restriccion, causasNegativa, texto: `${estado} ${quien}${aQuien}.` };
}
