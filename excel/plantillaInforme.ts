/**
 * La plantilla del informe PDF (V3), común a los dos informes (costos y
 * cronograma): portada, logo, pie de página, color, página y qué secciones
 * van y en qué orden. Se guarda en el libro, así que viaja con él y vale
 * para todos los que lo usen. Sin Office.js (el guardado está en
 * `almacenPlantilla.ts`).
 */

export type IdSeccionCostos = 'ajustes' | 'entradas' | 'registro' | 'salidas' | 'comparar';
export type IdSeccionCronograma =
  | 'enPalabras' | 'supuestos' | 'calidad' | 'fin' | 'contractuales' | 'gantt' | 'costo' | 'prePost'
  | 'reserva' | 'riesgos' | 'registro' | 'criticas' | 'convergencias' | 'avisos';

export const SECCIONES_COSTOS: readonly { id: IdSeccionCostos; nombre: string }[] = [
  { id: 'ajustes', nombre: 'Cómo se calculó' },
  { id: 'entradas', nombre: 'Entradas inciertas' },
  { id: 'registro', nombre: 'Registro de riesgos' },
  { id: 'salidas', nombre: 'Resultados de cada salida' },
  { id: 'comparar', nombre: 'Comparar salidas' },
];

export const SECCIONES_CRONOGRAMA: readonly { id: IdSeccionCronograma; nombre: string }[] = [
  { id: 'enPalabras', nombre: 'En pocas palabras' },
  { id: 'supuestos', nombre: 'Supuestos' },
  { id: 'calidad', nombre: 'Advertencias de calidad del cronograma' },
  { id: 'fin', nombre: 'Fecha de fin (percentiles y curva S)' },
  { id: 'contractuales', nombre: 'Hitos contractuales y multas' },
  { id: 'gantt', nombre: 'Gantt y fechas de fin posibles' },
  { id: 'costo', nombre: 'Costo y JCL' },
  { id: 'prePost', nombre: 'Antes y después de mitigar' },
  { id: 'reserva', nombre: 'Reserva de contingencia' },
  { id: 'riesgos', nombre: 'Los riesgos que más pesan' },
  { id: 'registro', nombre: 'Registro de riesgos' },
  { id: 'criticas', nombre: 'Actividades más críticas y rutas' },
  { id: 'convergencias', nombre: 'Sesgo de convergencia' },
  { id: 'avisos', nombre: 'Avisos de la simulación' },
];

export interface Seccion<T extends string> {
  id: T;
  visible: boolean;
}

export interface PlantillaInforme {
  version: 1;
  /** Vacío: el título del proyecto (o uno por defecto). */
  titulo: string;
  subtitulo: string;
  empresa: string;
  autor: string;
  /** Imagen como `data:image/png;base64,…` (o jpeg), ya reducida. */
  logo?: string;
  /** Texto del pie de cada página (p. ej. «Confidencial · Uso interno»). */
  pie: string;
  numeroPagina: boolean;
  /** Color de títulos y líneas, `#rrggbb`. */
  color: string;
  tamano: 'A4' | 'Letter' | 'Legal';
  orientacion: 'portrait' | 'landscape';
  seccionesCostos: Seccion<IdSeccionCostos>[];
  seccionesCronograma: Seccion<IdSeccionCronograma>[];
}

/** Tamaño máximo del logo en la plantilla (caracteres del `data:`): va en la dirección del informe. */
export const LOGO_MAXIMO = 120_000;

export function plantillaPorDefecto(): PlantillaInforme {
  return {
    version: 1,
    titulo: '',
    subtitulo: '',
    empresa: '',
    autor: '',
    pie: '',
    numeroPagina: true,
    color: '#1F4E79',
    tamano: 'A4',
    orientacion: 'portrait',
    seccionesCostos: SECCIONES_COSTOS.map((s) => ({ id: s.id, visible: true })),
    seccionesCronograma: SECCIONES_CRONOGRAMA.map((s) => ({ id: s.id, visible: true })),
  };
}

/**
 * Una plantilla leída del libro (o de cualquier sitio), completada y
 * corregida: lo que falte o no se entienda toma el valor por defecto, y las
 * secciones quedan todas, sin repetir, en el orden guardado.
 */
export function normalizarPlantilla(x: unknown): PlantillaInforme {
  const d = plantillaPorDefecto();
  if (!x || typeof x !== 'object') return d;
  const o = x as Record<string, unknown>;
  const texto = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
  const secciones = <T extends string>(v: unknown, todas: readonly { id: T }[]): Seccion<T>[] => {
    const validas = new Set(todas.map((s) => s.id));
    const vistas = new Set<T>();
    const out: Seccion<T>[] = [];
    if (Array.isArray(v)) {
      for (const s of v as Record<string, unknown>[]) {
        const id = s?.id as T;
        if (!validas.has(id) || vistas.has(id)) continue;
        vistas.add(id);
        out.push({ id, visible: s.visible !== false });
      }
    }
    for (const s of todas) if (!vistas.has(s.id)) out.push({ id: s.id, visible: true });
    return out;
  };
  const logo = typeof o.logo === 'string' && /^data:image\/(png|jpeg|jpg|gif|svg\+xml);base64,/.test(o.logo) && o.logo.length <= LOGO_MAXIMO ? o.logo : undefined;
  return {
    version: 1,
    titulo: texto(o.titulo, 200),
    subtitulo: texto(o.subtitulo, 200),
    empresa: texto(o.empresa, 150),
    autor: texto(o.autor, 150),
    ...(logo ? { logo } : {}),
    pie: texto(o.pie, 200),
    numeroPagina: o.numeroPagina !== false,
    color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : d.color,
    tamano: o.tamano === 'Letter' || o.tamano === 'Legal' ? o.tamano : 'A4',
    orientacion: o.orientacion === 'landscape' ? 'landscape' : 'portrait',
    seccionesCostos: secciones(o.seccionesCostos, SECCIONES_COSTOS),
    seccionesCronograma: secciones(o.seccionesCronograma, SECCIONES_CRONOGRAMA),
  };
}

/** Mueve una sección un puesto arriba (−1) o abajo (+1). */
export function moverSeccion<T extends string>(lista: readonly Seccion<T>[], id: T, paso: -1 | 1): Seccion<T>[] {
  const i = lista.findIndex((s) => s.id === id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= lista.length) return [...lista];
  const out = [...lista];
  [out[i], out[j]] = [out[j] as Seccion<T>, out[i] as Seccion<T>];
  return out;
}

/** Un texto dentro de `content: "…"` de CSS: sin comillas ni saltos que rompan la regla. */
export function textoCss(t: string): string {
  return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '')}"`;
}

/**
 * La regla `@page` para imprimir: tamaño, orientación y, en los márgenes de
 * cada página, el pie (abajo a la izquierda) y el número de página (abajo a
 * la derecha). Los márgenes con texto los pintan Chrome y Edge (y Safari
 * reciente); donde no, el informe se imprime igual, sin ellos.
 */
export function reglaPagina(p: PlantillaInforme): string {
  const estilo = 'font-size: 9px; color: #616161;';
  const pie = p.pie.trim() ? ` @bottom-left { content: ${textoCss(p.pie.trim())}; ${estilo} }` : '';
  const numero = p.numeroPagina ? ` @bottom-right { content: "Página " counter(page) " de " counter(pages); ${estilo} }` : '';
  return `@page { size: ${p.tamano} ${p.orientacion}; margin: 14mm 14mm 18mm;${pie}${numero} }`;
}

/** Las secciones visibles, en el orden de la plantilla (sin plantilla: todas, en el orden de siempre). */
export function seccionesVisibles<T extends string>(lista: readonly Seccion<T>[] | undefined, todas: readonly { id: T }[]): T[] {
  return (lista ?? todas.map((s) => ({ id: s.id, visible: true }))).filter((s) => s.visible).map((s) => s.id);
}
