/**
 * Rellenar los rangos vacíos (mínimo, más probable, máximo) de la hoja
 * «Actividades» con un porcentaje de la duración. Un cronograma importado de
 * MS Project o P6 no trae incertidumbre, y sin ella la simulación no enseña
 * nada; esto da un punto de partida para que el equipo lo afine después
 * (el chequeo de salud avisa mientras falten).
 *
 * Por defecto −10 % / +25 %: asimétrico, porque en obra y en proyectos las
 * duraciones se alargan más de lo que se acortan (sesgo optimista). Solo se
 * tocan las filas con duración > 0 y sin mínimo ni máximo, y nunca las
 * terminadas.
 */

import type { HojaAEscribir } from './hojas.ts';
import { leerActividades, leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';

export interface CambioCelda {
  /** Fila y columna desde 0 en la matriz de la hoja. */
  fila: number;
  col: number;
  valor: number;
}

export function completarRangos(
  valores: readonly (readonly unknown[])[],
  menos = 0.1,
  mas = 0.25,
  tipos: readonly TipoRango[] = [],
): { cambios: CambioCelda[]; actividades: number; porTipo: Record<string, number> } | { error: string } {
  if (!(menos >= 0 && menos < 1) || !(mas >= 0)) return { error: 'Los porcentajes deben ser 0 % ≤ menos < 100 % y más ≥ 0 %' };
  // El encabezado y sus columnas, igual que el lector.
  let filaEnc = -1;
  let cols: { dur: number; min: number; mp: number; max: number; finReal: number; nombre: number; categoria: number } | null = null;
  const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (let f = 0; f < Math.min(15, valores.length) && !cols; f++) {
    const fila = (valores[f] ?? []).map(norm);
    const buscar = (pred: (t: string) => boolean) => fila.findIndex(pred);
    const id = buscar((t) => t === 'id');
    const dur = buscar((t) => t.startsWith('duracion') && !t.startsWith('duracion restante'));
    if (id < 0 || dur < 0) continue;
    filaEnc = f;
    cols = {
      dur,
      min: buscar((t) => t.startsWith('minim') || t === 'min' || t.startsWith('optimista')),
      mp: buscar((t) => t.startsWith('mas probable') || t.startsWith('probable')),
      max: buscar((t) => t.startsWith('maxim') || t === 'max' || t.startsWith('pesimista')),
      finReal: buscar((t) => t.startsWith('fin real')),
      nombre: buscar((t) => t.startsWith('actividad') || t.startsWith('nombre') || t.startsWith('tarea')),
      categoria: buscar((t) => t.startsWith('categoria') || t.startsWith('frente')),
    };
  }
  if (!cols || filaEnc < 0) return { error: 'No se encuentra el encabezado de «Actividades» (hacen falta «ID» y «Duración»)' };
  if (cols.min < 0 || cols.max < 0 || cols.mp < 0) return { error: 'Faltan las columnas «Mínimo», «Más probable» y «Máximo» en «Actividades»' };
  // Solo si la hoja se lee sin errores: no se rellena sobre datos que no se entienden.
  const lectura = leerActividades(valores);
  if (lectura.problemas.some((p) => p.gravedad === 'error')) return { error: 'Corrige primero los errores de «Actividades» (pulsa Calcular cronograma para verlos)' };

  const vacia = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const cambios: CambioCelda[] = [];
  const porTipo: Record<string, number> = {};
  let actividades = 0;
  const redondo = (x: number) => Math.round(x * 100) / 100;
  for (let f = filaEnc + 1; f < valores.length; f++) {
    const fila = valores[f] ?? [];
    const d = fila[cols.dur];
    if (typeof d !== 'number' || !(d > 0)) continue;
    if (cols.finReal >= 0 && !vacia(fila[cols.finReal])) continue;
    if (!vacia(fila[cols.min]) || !vacia(fila[cols.max])) continue;
    actividades++;
    // V6: el tipo de la biblioteca que case con la categoría o el nombre; si ninguno, los porcentajes dados.
    const tipo = tipoDe(tipos, cols.categoria >= 0 ? fila[cols.categoria] : '', cols.nombre >= 0 ? fila[cols.nombre] : '');
    if (tipo) porTipo[tipo.tipo] = (porTipo[tipo.tipo] ?? 0) + 1;
    const [m1, m2] = tipo ? [tipo.menos, tipo.mas] : [menos, mas];
    cambios.push({ fila: f, col: cols.min, valor: redondo(d * (1 - m1)) });
    if (vacia(fila[cols.mp])) cambios.push({ fila: f, col: cols.mp, valor: d });
    cambios.push({ fila: f, col: cols.max, valor: redondo(d * (1 + m2)) });
  }
  return { cambios, actividades, porTipo };
}

// ---------------------------------------------------------------------------
// V6: la biblioteca «Rangos por tipo».
// ---------------------------------------------------------------------------

export const HOJA_RANGOS_TIPO = 'Rangos por tipo';

export interface TipoRango {
  tipo: string;
  /** Palabras (normalizadas) que, al principio de una palabra de la categoría o del nombre, la identifican. */
  claves: string[];
  /** Cuánto puede acortarse y alargarse, como fracción de la duración. */
  menos: number;
  mas: number;
}

/**
 * Valores de partida, **no datos de referencia**: rangos habituales en la
 * práctica para cada tipo de trabajo, siempre más largos por arriba que por
 * abajo. La hoja que se escribe con ellos es del usuario: se ajusta con el
 * histórico de la empresa o del sector.
 */
export const BIBLIOTECA_RANGOS: ReadonlyArray<TipoRango & { nota: string }> = [
  { tipo: 'Trámites y permisos', claves: ['tramite', 'permiso', 'licencia', 'aprobacion', 'consulta previa', 'radicacion'], menos: 0.1, mas: 0.6, nota: 'Dependen de terceros: la cola larga es la norma.' },
  { tipo: 'Diseño y estudios', claves: ['diseno', 'estudio', 'ingenieria', 'topografia', 'planos'], menos: 0.1, mas: 0.3, nota: 'Revisiones y cambios del cliente.' },
  { tipo: 'Suministros e importaciones', claves: ['suministro', 'fabricacion', 'compra', 'importacion', 'pedido', 'entrega de equipos'], menos: 0.05, mas: 0.4, nota: 'Plazos de fábrica, transporte y aduana.' },
  { tipo: 'Movimiento de tierras y cimentación', claves: ['excavacion', 'cimentacion', 'movimiento de tierra', 'pilotaje', 'relleno'], menos: 0.1, mas: 0.4, nota: 'El subsuelo y el clima.' },
  { tipo: 'Obra gris y estructura', claves: ['obra gris', 'estructura', 'mamposteria', 'cubierta', 'concreto', 'obra civil', 'muro'], menos: 0.1, mas: 0.3, nota: 'Rendimiento de cuadrillas y clima.' },
  { tipo: 'Instalaciones', claves: ['instalacion', 'electric', 'hidraulic', 'sanitari', 'redes', 'mecanic'], menos: 0.1, mas: 0.3, nota: 'Coordinación entre oficios.' },
  { tipo: 'Acabados', claves: ['acabado', 'pintura', 'fachada', 'carpinteria', 'enchape', 'limpieza'], menos: 0.05, mas: 0.25, nota: 'Trabajo repetitivo, pero al final de la obra.' },
  { tipo: 'Pruebas y puesta en marcha', claves: ['prueba', 'puesta en marcha', 'comisionamiento', 'certificacion'], menos: 0.1, mas: 0.4, nota: 'Lo que falla se repara y se vuelve a probar.' },
  { tipo: 'Desarrollo de software', claves: ['desarrollo', 'programacion', 'software', 'integracion', 'migracion', 'sprint'], menos: 0.15, mas: 0.5, nota: 'Requisitos que cambian y deuda técnica.' },
];

export const ENCABEZADO_RANGOS_TIPO = ['Tipo', 'Palabras clave (categoría o nombre)', 'Menos (%)', 'Más (%)', 'Nota'];

export function plantillaRangosTipo(): HojaAEscribir {
  return {
    nombre: HOJA_RANGOS_TIPO,
    valores: [
      ['Rangos por tipo de actividad — valores de partida, no datos de referencia: ajústalos con tu histórico. «Rellenar los rangos vacíos» usa la primera fila cuyas palabras clave aparezcan en la categoría o el nombre de la actividad.'],
      [''],
      ENCABEZADO_RANGOS_TIPO,
      ...BIBLIOTECA_RANGOS.map((t) => [t.tipo, t.claves.join(', '), t.menos, t.mas, t.nota]),
    ],
    formatos: { 2: '0%', 3: '0%' },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [34, 60, 11, 11, 44],
  };
}

/** Un porcentaje de celda: 0,25, «25 %» o 25 (más de 1 se entiende en %). */
function fraccion(v: unknown): number | undefined {
  const x = typeof v === 'string' && /%\s*$/.test(v) ? (numeroDe(v.replace('%', '')) ?? NaN) / 100 : numeroDe(v);
  if (x === undefined || Number.isNaN(x)) return undefined;
  return x > 1 ? x / 100 : x;
}

export function leerRangosTipo(valores?: readonly (readonly unknown[])[]): { tipos: TipoRango[]; problemas: string[] } {
  if (!valores || valores.length === 0) return { tipos: [], problemas: [] };
  const t = leerHojaGenerica(valores, { tipo: ['tipo'], claves: ['palabras', 'claves'], menos: ['menos'], mas: ['mas'] }, ['tipo', 'menos', 'mas']);
  if (!t.ok) return { tipos: [], problemas: [`«${HOJA_RANGOS_TIPO}»: ${t.error}`] };
  const tipos: TipoRango[] = [];
  const problemas: string[] = [];
  for (const f of t.filas) {
    const nombre = String(f.celda('tipo')).trim();
    const menos = fraccion(f.celda('menos'));
    const mas = fraccion(f.celda('mas'));
    if (menos === undefined || mas === undefined || menos < 0 || menos >= 1 || mas < 0) {
      problemas.push(`«${HOJA_RANGOS_TIPO}», fila ${f.fila} («${nombre}»): «Menos» debe estar entre 0 % y 99 % y «Más» ser ≥ 0 %`);
      continue;
    }
    const texto = String(f.celda('claves') ?? '');
    const claves = [nombre, ...texto.split(/[,;\n]/)].map(normalizar).filter((x) => x !== '');
    tipos.push({ tipo: nombre, claves: [...new Set(claves)], menos, mas });
  }
  return { tipos, problemas };
}

/** El primer tipo con una palabra clave al principio de alguna palabra de la categoría o del nombre. */
export function tipoDe(tipos: readonly TipoRango[], categoria: unknown, nombre: unknown): TipoRango | undefined {
  const texto = ` ${normalizar(categoria)} ${normalizar(nombre)} `.replace(/[^a-z0-9ñ]+/g, ' ');
  return tipos.find((t) => t.claves.some((c) => texto.includes(` ${c.replace(/[^a-z0-9ñ]+/g, ' ').trim()}`)));
}
