/**
 * W7: la hoja «Escenarios» del libro de cronograma (cada fila, un cambio; las
 * filas con el mismo nombre forman un escenario) y la hoja
 * `Resultados_Escenarios` con la comparación. Sin Office.js: recibe la
 * matriz de la hoja (desde A1) y el modelo ya leído.
 */

import { CAMBIOS, leerPredecesoras, narrativaEscenarios, type Cambio, type ComparacionEscenarios, type Escenario, type ModeloCronograma } from '../engine/cronograma/index.ts';
import { fechaDeCelda, FORMATO_FECHA, HOJAS_CRONOGRAMA, letraColumna, normalizar, numero, siNo, texto, vacia, type Celda, type ErrorHoja, type MatrizHoja } from './cronogramaHojas.ts';
import type { HojaResultados } from './cronogramaResultados.ts';

export const HOJA_ESCENARIOS = HOJAS_CRONOGRAMA.escenarios;
export const HOJA_RESULTADOS_ESCENARIOS = 'Resultados_Escenarios';

/** −20 %, -0,2, «−20» → −0,2. */
function porcentajeConSigno(v: unknown): number | null {
  const x = numero(typeof v === 'string' ? v.replace('−', '-') : v);
  if (x === null) return null;
  return Math.abs(x) > 1 ? x / 100 : x;
}

export interface LecturaEscenarios {
  escenarios: Escenario[];
  errores: ErrorHoja[];
}

/** Lee la hoja Escenarios contra el modelo (los ids tienen que existir en él). */
export function leerEscenarios(m: MatrizHoja | undefined, modelo: ModeloCronograma): LecturaEscenarios {
  const hoja = HOJA_ESCENARIOS;
  const errores: ErrorHoja[] = [];
  const escenarios: Escenario[] = [];
  if (!m || m.length < 2) return { escenarios, errores };
  const enc = (m[0] ?? []).map(normalizar);
  const col = (nombre: string) => {
    const n = normalizar(nombre);
    const i = enc.findIndex((h) => h === n || h.startsWith(n.split(' (')[0] as string));
    return i;
  };
  const cE = col('Escenario');
  const cC = col('Cambio');
  const cS = col('Sobre (ID)');
  const cV = col('Valor');
  if (cE < 0 || cC < 0) return { escenarios, errores: [{ hoja, fila: 1, columna: 'A', mensaje: 'Faltan las columnas «Escenario» y «Cambio» en la fila 1' }] };
  const L = (c: number) => letraColumna(c);
  const actividades = new Map(modelo.red.actividades.map((a) => [normalizar(a.id), a.id]));
  const riesgos = new Map(modelo.riesgos.map((r) => [normalizar(r.id), r]));
  const partidas = new Map((modelo.costos ?? []).map((c) => [normalizar(c.id), c.id]));
  const calendarios = new Map(modelo.red.calendarios.map((c) => [normalizar(c.id), c.id]));
  for (let f = 1; f < m.length; f++) {
    const fila = m[f] ?? [];
    const nombre = texto(fila[cE]);
    const textoCambio = texto(fila[cC]);
    if (!nombre && !textoCambio) continue;
    const error = (c: number, mensaje: string) => errores.push({ hoja, fila: f + 1, columna: L(c), mensaje });
    if (!nombre) { error(cE, 'Falta el nombre del escenario'); continue; }
    const def = CAMBIOS.find((x) => normalizar(textoCambio).startsWith(normalizar(x.texto)));
    if (!def) { error(cC, `«${textoCambio}» no es un cambio conocido: ${CAMBIOS.map((x) => x.texto).join(', ')}`); continue; }
    const crudo = cS >= 0 ? texto(fila[cS]) : '';
    const valor = cV >= 0 ? fila[cV] : undefined;
    const ids: string[] = [];
    let mal = '';
    const partes = crudo.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    if (def.sobre !== 'proyecto' && partes.length === 0) {
      error(cS, `Falta ${def.sobre === 'actividad' ? 'la actividad (ID, «WBS 2» o «Grupo nombre»)' : def.sobre === 'riesgo' ? 'el riesgo (ID)' : 'la partida de costo (ID)'}`);
      continue;
    }
    for (const p of partes) {
      if (def.sobre === 'actividad') {
        const sel = /^(wbs|grupo)\s*[:=]?\s+(.+)$/i.exec(p);
        if (sel) {
          const clase = (sel[1] as string).toLowerCase();
          const v = (sel[2] as string).trim();
          const del = (modelo.info ?? []).filter((i) => clase === 'wbs' ? i.wbs !== undefined && (i.wbs === v || i.wbs.startsWith(`${v}.`)) : i.grupo !== undefined && normalizar(i.grupo) === normalizar(v)).map((i) => i.id);
          if (del.length) ids.push(...del);
          else mal = p;
        } else {
          const id = actividades.get(normalizar(p));
          if (id) ids.push(id);
          else mal = p;
        }
      } else if (def.sobre === 'riesgo') {
        const r = riesgos.get(normalizar(p));
        if (r) ids.push(r.id);
        else mal = p;
      } else if (def.sobre === 'partida') {
        const id = partidas.get(normalizar(p));
        if (id) ids.push(id);
        else mal = p;
      } else {
        const id = calendarios.get(normalizar(p));
        if (id) ids.push(id);
        else mal = p;
      }
    }
    if (mal) {
      error(cS, def.sobre === 'riesgo' ? `«${mal}» no es un riesgo activo de la hoja Riesgos`
        : def.sobre === 'partida' ? `«${mal}» no es una partida de la hoja Costos`
          : def.sobre === 'proyecto' ? `«${mal}» no es un calendario de la hoja Calendario`
            : `«${mal}» no es una actividad, una WBS ni un grupo`);
      continue;
    }
    let v: number | string = '';
    const n = numero(typeof valor === 'string' ? valor.replace('−', '-') : valor);
    const tanto = porcentajeConSigno(valor);
    switch (def.tipo) {
      case 'duracion%':
      case 'impacto%':
        if (tanto === null || tanto <= -1) { error(cV, 'El valor tiene que ser un porcentaje mayor que −100 %'); continue; }
        v = tanto;
        break;
      case 'duracionDias':
        if (n === null) { error(cV, 'El valor tiene que ser un número de días'); continue; }
        v = n;
        break;
      case 'valorPartida':
        if (n === null || n < 0) { error(cV, 'El valor de la partida tiene que ser un número positivo'); continue; }
        v = n;
        break;
      case 'probabilidad': {
        const p = tanto === null ? null : Math.abs(tanto);
        if (p === null || p > 1) { error(cV, 'La probabilidad tiene que estar entre 0 % y 100 %'); continue; }
        v = p;
        break;
      }
      case 'predecesoras': {
        const t = texto(valor);
        const p = leerPredecesoras(t);
        if (!p.ok) { error(cV, p.error); continue; }
        const desconocida = p.predecesoras.find((x) => !actividades.has(normalizar(x.id)));
        if (desconocida) { error(cV, `La predecesora «${desconocida.id}» no es una actividad`); continue; }
        v = p.predecesoras.map((x) => ({ ...x, id: actividades.get(normalizar(x.id)) as string }))
          .map((x) => `${x.id} ${x.tipo}${x.desfase ? `${x.desfase > 0 ? '+' : '-'}${Math.abs(x.desfase)}${x.transcurrido ? 'dc' : 'd'}` : ''}`).join('; ');
        break;
      }
      case 'sabados':
      case 'domingos':
        if (vacia(valor)) { error(cV, 'Escriba Sí o No'); continue; }
        v = siNo(valor, false) ? 1 : 0;
        break;
      case 'inicio': {
        const d = fechaDeCelda(valor);
        if (d === null) { error(cV, 'El inicio tiene que ser una fecha'); continue; }
        v = d;
        break;
      }
      case 'respuesta':
        if (ids.some((id) => {
          const r = riesgos.get(normalizar(id));
          return !r || (r.probabilidadPost === undefined && r.factorImpactoPost === undefined);
        })) { error(cS, 'El riesgo no tiene datos post mitigación (probabilidad post o % del impacto post en la hoja Riesgos)'); continue; }
        break;
      default:
        break;
    }
    const valorTexto = typeof v === 'number' && (def.tipo === 'duracion%' || def.tipo === 'impacto%' || def.tipo === 'probabilidad')
      ? `${v > 0 && def.tipo !== 'probabilidad' ? '+' : ''}${Math.round(v * 1000) / 10} %`
      : def.tipo === 'sabados' || def.tipo === 'domingos' ? (v ? 'Sí' : 'No')
        : def.tipo === 'inicio' ? texto(valor) : String(v);
    const cambio: Cambio = { tipo: def.tipo, ids, valor: v, texto: [def.texto, valorTexto, crudo].filter((x) => x !== '').join(' · ') };
    let e = escenarios.find((x) => normalizar(x.nombre) === normalizar(nombre));
    if (!e) escenarios.push((e = { nombre, cambios: [] }));
    e.cambios.push(cambio);
  }
  return { escenarios, errores };
}

const PCT = '0%';
const MONEDA = '#,##0';

/** La hoja Resultados_Escenarios: la base y una fila por escenario, y las frases. */
export function hojaResultadosEscenarios(c: ComparacionEscenarios, fecha: (serie: number) => string): HojaResultados {
  const conCosto = c.base.costoP80 !== null;
  const conMeta = c.base.probMeta !== null;
  const hitos = c.base.hitos.map((h) => h.id);
  const enc: Celda[] = [
    'Escenario', 'Cambios', 'Fin P50', 'Fin P80', 'Adelanto del P80 (días)', 'Adelanto medio (días)', '± al 95 %', '± con números independientes',
    'Termina antes', 'Termina después', ...(conMeta ? ['Cumple la meta'] : []), ...(conCosto ? ['Costo P80', 'Ahorro en el costo P80'] : []),
    ...hitos.map((h) => `Cumple el hito ${h}`),
  ];
  const fmts: (string | null)[] = [
    null, null, FORMATO_FECHA, FORMATO_FECHA, '0', '0.0', '0.00', '0.00', PCT, PCT, ...(conMeta ? [PCT] : []), ...(conCosto ? [MONEDA, MONEDA] : []), ...hitos.map(() => PCT),
  ];
  const valores: Celda[][] = [];
  const formatos: (string | null)[][] = [];
  const fila = (v: Celda[], f: (string | null)[] = []) => {
    valores.push(v);
    formatos.push(f);
    return valores.length - 1;
  };
  const t0 = fila([`Escenarios «¿qué pasa si?»: ${c.iteraciones.toLocaleString('es-CO')} iteraciones con los mismos números aleatorios que la base (semilla ${c.semilla})`]);
  fila(['Hoja generada por el complemento: no la edite a mano. Los cambios se escriben en la hoja Escenarios.']);
  fila([]);
  const e0 = fila(enc);
  const b = c.base;
  fila(['Base (sin cambios)', '', b.p50, b.p80, null, null, null, null, null, null, ...(conMeta ? [b.probMeta] : []), ...(conCosto ? [b.costoP80, null] : []), ...b.hitos.map((h) => h.probabilidad)], fmts);
  for (const e of c.escenarios) {
    fila([e.nombre, e.cambios.join('; '), e.p50, e.p80, e.adelantoP80, e.adelantoMedio, e.ic95, e.ic95Independientes, e.probAntes, e.probDespues,
      ...(conMeta ? [e.probMeta] : []), ...(conCosto ? [e.costoP80, e.ahorroCostoP80] : []), ...hitos.map((id) => e.hitos.find((h) => h.id === id)?.probabilidad ?? null)], fmts);
  }
  fila([]);
  const t1 = fila(['En palabras']);
  for (const t of narrativaEscenarios(c, fecha)) fila([t]);
  for (const p of c.problemas) fila([p]);
  const ancho = Math.max(...valores.map((v) => v.length), 9);
  for (let r = 0; r < valores.length; r++) {
    while ((valores[r] as Celda[]).length < ancho) (valores[r] as Celda[]).push(null);
    while ((formatos[r] as (string | null)[]).length < ancho) (formatos[r] as (string | null)[]).push(null);
  }
  return { valores, formatos, negritas: [e0, t1], titulos: [t0, t1], semaforos: [], rangoCurva: null, graficos: [] };
}
