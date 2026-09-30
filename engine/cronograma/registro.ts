/**
 * Registro de riesgos completo (V10): cada riesgo con su estado, responsable,
 * próxima revisión y su lugar en la **matriz de probabilidad e impacto**
 * (5 × 5, con colores), la de cualquier plan de gestión de riesgos.
 *
 * - Probabilidad: niveles 1–5 por tramos (≤ 10 %, ≤ 30 %, ≤ 50 %, ≤ 70 %,
 *   más).
 * - Impacto: el nivel que diga el usuario («Impacto cualitativo») o, si no,
 *   el que sale de la simulación: lo que el riesgo aporta al P80 del plazo
 *   (en % de la duración) y del costo (en % del costo), el mayor de los dos
 *   (≤ 0,5 %, ≤ 2 %, ≤ 5 %, ≤ 10 %, más). Sin simulación, una estimación
 *   gruesa: impacto máximo × la actividad afectada más larga.
 * - Zona por puntaje (probabilidad × impacto): 15 o más, roja; 8–14,
 *   naranja; 4–7, amarilla; menos, verde.
 *
 * Las **oportunidades** (riesgos que solo acortan o ahorran, o cualitativos
 * con nivel negativo) van en su propia matriz, con su escala de azules
 * (alta, media, baja, mínima): su impacto es lo que se gana. La matriz
 * **consolidada** es la doble del PMBOK: amenazas a la izquierda (impacto
 * 1 → 5) y oportunidades a la derecha (5 → 1), con la probabilidad común;
 * lo que más pesa, de los dos lados, queda en el centro.
 */

import type { HojaAEscribir } from './hojas.ts';
import { FORMATO_FECHA } from './hojas.ts';
import type { RiesgoPlazo } from './riesgos.ts';
import type { ImpactoRiesgo } from './simulacion.ts';
import type { Actividad } from './tipos.ts';

export const HOJA_REGISTRO = 'Registro de riesgos';
export type Zona = 'roja' | 'naranja' | 'amarilla' | 'verde';
export const COLORES_ZONA: Record<Zona, string> = { roja: '#E34948', naranja: '#F39C45', amarilla: '#F7DC6F', verde: '#7DC98F' };
/** Zonas de las oportunidades (V10): cuánto conviene perseguirlas. */
export type ZonaOportunidad = 'alta' | 'media' | 'baja' | 'mínima';
export const COLORES_OPORTUNIDAD: Record<ZonaOportunidad, string> = { alta: '#4F8FDB', media: '#8DB8EC', baja: '#C3DAF5', mínima: '#E6F0FB' };
export type Clase = 'amenaza' | 'oportunidad';
const ESTADO_TEXTO = { abierto: 'Abierto', seguimiento: 'En seguimiento', cerrado: 'Cerrado', materializado: 'Materializado' } as const;

export const nivelProbabilidad = (p: number) => (p <= 0.1 ? 1 : p <= 0.3 ? 2 : p <= 0.5 ? 3 : p <= 0.7 ? 4 : 5);
const nivelPorFraccion = (x: number) => (x <= 0.005 ? 1 : x <= 0.02 ? 2 : x <= 0.05 ? 3 : x <= 0.1 ? 4 : 5);
export const zonaDe = (puntaje: number): Zona => (puntaje >= 15 ? 'roja' : puntaje >= 8 ? 'naranja' : puntaje >= 4 ? 'amarilla' : 'verde');
export const zonaOportunidadDe = (puntaje: number): ZonaOportunidad => (puntaje >= 15 ? 'alta' : puntaje >= 8 ? 'media' : puntaje >= 4 ? 'baja' : 'mínima');
/** El color de una casilla (o de un puntaje) según sea de amenaza o de oportunidad. */
export const colorDe = (clase: Clase, puntaje: number) => (clase === 'oportunidad' ? COLORES_OPORTUNIDAD[zonaOportunidadDe(puntaje)] : COLORES_ZONA[zonaDe(puntaje)]);

/** ¿Es una oportunidad? Solo acorta o ahorra (nada que alargue ni cueste), o es cualitativa con nivel negativo. */
export function esOportunidad(r: RiesgoPlazo): boolean {
  if (r.cualitativo) return (r.impactoCualitativo ?? 0) < 0;
  if (r.rama || (r.costo ?? 0) > 0 || r.impactoMax > 0) return false;
  const acorta = r.actividades.length > 0 && r.impactoMin < 0;
  const ahorra = (r.costo ?? 0) < 0;
  return acorta || ahorra;
}

export interface FilaRegistro {
  id: string;
  nombre: string;
  categoria?: string;
  estado: keyof typeof ESTADO_TEXTO;
  responsable?: string;
  respuesta?: string;
  revision?: number;
  /** La revisión ya pasó (y el riesgo no está cerrado). */
  vencida: boolean;
  probabilidad: number;
  nivelP: number;
  nivelI: number;
  /** De dónde sale el nivel de impacto. */
  origenImpacto: 'usuario' | 'simulación' | 'estimación' | 'sin impacto';
  puntaje: number;
  clase: Clase;
  /** Zona de amenaza o de oportunidad, según la clase. */
  zona: Zona | ZonaOportunidad;
  diasP80?: number;
  costoP80?: number;
  tipo: 'plazo' | 'costo' | 'plazo y costo' | 'cualitativo' | 'actividad nueva';
}

export interface Registro {
  filas: FilaRegistro[];
  /** `matriz[p-1][i-1]`: los IDs de las amenazas (no cerradas) en esa casilla. */
  matriz: string[][][];
  /** Lo mismo para las oportunidades. */
  matrizOportunidades: string[][][];
  vencidas: number;
}

export function evaluarRegistro(e: {
  riesgos: readonly RiesgoPlazo[];
  actividades: readonly Actividad[];
  /** De la simulación, si la hay. */
  impacto?: readonly ImpactoRiesgo[];
  /** Duración del cronograma (días) y su costo, para pasar el impacto a %. */
  dias: number;
  costo?: number;
  hoy: number;
}): Registro {
  const durMax = new Map(e.actividades.map((a) => [a.id, a.duracion]));
  const porId = new Map((e.impacto ?? []).map((x) => [x.id, x]));
  const filas: FilaRegistro[] = e.riesgos.map((r) => {
    const estado = r.estado ?? 'abierto';
    const sim = porId.get(r.id);
    const clase: Clase = esOportunidad(r) ? 'oportunidad' : 'amenaza';
    // Para una oportunidad, el impacto es lo que se gana (días o dinero de menos).
    const signo = clase === 'oportunidad' ? -1 : 1;
    let nivelI = 1;
    let origen: FilaRegistro['origenImpacto'] = 'sin impacto';
    if (r.impactoCualitativo !== undefined) {
      nivelI = Math.abs(r.impactoCualitativo);
      origen = 'usuario';
    } else if (sim) {
      const t = e.dias > 0 ? Math.max(0, signo * sim.diasP80) / e.dias : 0;
      const c = e.costo && sim.costoP80 !== undefined ? Math.max(0, signo * sim.costoP80) / e.costo : 0;
      nivelI = nivelPorFraccion(Math.max(t, c));
      origen = 'simulación';
    } else if (!r.cualitativo) {
      const larga = Math.max(0, ...r.actividades.map((id) => durMax.get(id) ?? 0), r.rama?.max ?? 0);
      const extremo = clase === 'oportunidad' ? -r.impactoMin : Math.max(0, r.impactoMax);
      const t = e.dias > 0 ? (extremo * larga + (r.rama ? r.rama.max : 0)) / e.dias : 0;
      const c = e.costo && r.costo ? Math.max(0, signo * r.costo) / e.costo : 0;
      nivelI = nivelPorFraccion(Math.max(t, c));
      origen = 'estimación';
    }
    const p = estado === 'materializado' ? 1 : r.probabilidad;
    const nivelP = nivelProbabilidad(p);
    const puntaje = nivelP * nivelI;
    const plazo = r.actividades.length > 0 && (r.impactoMax !== 0 || r.impactoMin !== 0);
    const tipo: FilaRegistro['tipo'] = r.cualitativo ? 'cualitativo' : r.rama ? 'actividad nueva' : plazo && r.costo ? 'plazo y costo' : plazo ? 'plazo' : 'costo';
    return {
      id: r.id, nombre: r.nombre, estado, probabilidad: p, nivelP, nivelI, origenImpacto: origen, puntaje, tipo, clase,
      zona: clase === 'oportunidad' ? zonaOportunidadDe(puntaje) : zonaDe(puntaje),
      vencida: estado !== 'cerrado' && r.revision !== undefined && r.revision < Math.floor(e.hoy),
      ...(r.categoriaRiesgo ? { categoria: r.categoriaRiesgo } : {}),
      ...(r.responsable ? { responsable: r.responsable } : {}),
      ...(r.respuesta ? { respuesta: r.respuesta } : {}),
      ...(r.revision !== undefined ? { revision: r.revision } : {}),
      ...(sim ? { diasP80: sim.diasP80, ...(sim.costoP80 !== undefined ? { costoP80: sim.costoP80 } : {}) } : {}),
    };
  });
  // Primero las amenazas abiertas y luego las oportunidades, de mayor a menor puntaje; los cerrados al final.
  filas.sort((a, b) => Number(a.estado === 'cerrado') - Number(b.estado === 'cerrado') || Number(a.clase === 'oportunidad') - Number(b.clase === 'oportunidad')
    || b.puntaje - a.puntaje || Math.abs(b.diasP80 ?? 0) - Math.abs(a.diasP80 ?? 0));
  const vacia = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => [] as string[]));
  const matriz = vacia();
  const matrizOportunidades = vacia();
  for (const f of filas) {
    if (f.estado === 'cerrado') continue;
    ((f.clase === 'oportunidad' ? matrizOportunidades : matriz)[f.nivelP - 1] as string[][])[f.nivelI - 1]!.push(f.id);
  }
  return { filas, matriz, matrizOportunidades, vencidas: filas.filter((f) => f.vencida).length };
}

const P_TEXTO = ['1 · muy baja (≤ 10 %)', '2 · baja (≤ 30 %)', '3 · media (≤ 50 %)', '4 · alta (≤ 70 %)', '5 · muy alta (> 70 %)'];
const I_TEXTO = ['1 · muy bajo', '2 · bajo', '3 · medio', '4 · alto', '5 · muy alto'];

/** Las casillas de la matriz consolidada, de izquierda a derecha: amenazas I1…I5 y oportunidades I5…I1 (la doble del PMBOK). */
export const COLUMNAS_CONSOLIDADA: ReadonlyArray<{ clase: Clase; i: number }> = [
  ...[1, 2, 3, 4, 5].map((i) => ({ clase: 'amenaza' as const, i })),
  ...[5, 4, 3, 2, 1].map((i) => ({ clase: 'oportunidad' as const, i })),
];

/** La hoja «Registro de riesgos»: las tres matrices coloreadas (amenazas, oportunidades y consolidada) y la lista. */
export function hojaRegistro(reg: Registro): HojaAEscribir {
  const v: (string | number)[][] = [
    ['Registro de riesgos — lo escribe el complemento a partir de «Riesgos de plazo» (edita allí); se rehace al calcular y al simular'],
    [reg.vencidas > 0 ? `${reg.vencidas} riesgo${reg.vencidas === 1 ? '' : 's'} con la revisión vencida (en rojo en la lista).` : 'Sin revisiones vencidas.'],
    [''],
  ];
  const colores: NonNullable<HojaAEscribir['colores']> = [];
  const encabezados: number[] = [];
  const matriz = (titulo: string, m: string[][][], clase: Clase) => {
    v.push([titulo]);
    encabezados.push(v.length);
    v.push(['Probabilidad \\ Impacto', ...I_TEXTO]);
    for (let p = 5; p >= 1; p--) {
      const fila = v.length;
      v.push([P_TEXTO[p - 1] as string, ...[1, 2, 3, 4, 5].map((i) => ((m[p - 1] as string[][])[i - 1] as string[]).join(', '))]);
      for (let i = 1; i <= 5; i++) colores.push({ fila, col: i, color: colorDe(clase, p * i) });
    }
    v.push(['']);
  };
  matriz('Amenazas', reg.matriz, 'amenaza');
  matriz('Oportunidades', reg.matrizOportunidades, 'oportunidad');
  v.push(['Consolidada: amenazas a la izquierda, oportunidades a la derecha (lo más importante de las dos, en el centro)']);
  encabezados.push(v.length);
  v.push(['Probabilidad', ...COLUMNAS_CONSOLIDADA.map((c) => `${c.clase === 'amenaza' ? 'Amenaza' : 'Oportunidad'} I${c.i}`)]);
  for (let p = 5; p >= 1; p--) {
    const fila = v.length;
    v.push([P_TEXTO[p - 1] as string, ...COLUMNAS_CONSOLIDADA.map((c) => (((c.clase === 'amenaza' ? reg.matriz : reg.matrizOportunidades)[p - 1] as string[][])[c.i - 1] as string[]).join(', '))]);
    COLUMNAS_CONSOLIDADA.forEach((c, j) => colores.push({ fila, col: j + 1, color: colorDe(c.clase, p * c.i) }));
  }
  v.push(['']);
  const enc = v.length;
  encabezados.push(enc);
  v.push(['ID', 'Riesgo', 'Clase', 'Categoría', 'Tipo', 'Estado', 'Responsable', 'Próxima revisión', 'Probabilidad', 'Nivel P', 'Nivel I', 'Puntaje', 'Zona', 'Impacto según', 'Días al P80', 'Costo al P80', 'Respuesta']);
  const primera = v.length;
  for (const f of reg.filas) {
    const fila = v.length;
    v.push([
      f.id, f.nombre, f.clase, f.categoria ?? '', f.tipo, ESTADO_TEXTO[f.estado], f.responsable ?? '', f.revision ?? '', f.probabilidad, f.nivelP, f.nivelI, f.puntaje,
      f.zona, f.origenImpacto, f.diasP80 ?? '', f.costoP80 ?? '', f.respuesta ?? '',
    ]);
    if (f.estado !== 'cerrado') colores.push({ fila, col: 12, color: colorDe(f.clase, f.puntaje) });
    if (f.vencida) colores.push({ fila, col: 7, color: COLORES_ZONA.roja });
  }
  return {
    nombre: HOJA_REGISTRO,
    valores: v,
    formatos: {},
    formatosRango: reg.filas.length > 0
      ? [{ fila: primera, col: 7, filas: reg.filas.length, cols: 1, formato: FORMATO_FECHA }, { fila: primera, col: 8, filas: reg.filas.length, cols: 1, formato: '0%' }]
      : [],
    filaEncabezado: encabezados[0] as number,
    otrosEncabezados: encabezados.slice(1),
    primeraFilaDatos: primera,
    anchos: [22, 16, 16, 16, 16, 16, 18, 16, 16, 16, 16, 12, 12, 14, 11, 13, 40],
    colores,
  };
}
