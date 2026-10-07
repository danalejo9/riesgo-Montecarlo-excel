/**
 * V6: la biblioteca de rangos por tipo de trabajo, para rellenar la
 * incertidumbre de un cronograma que no la trae (uno importado de MS Project
 * o P6). Sin Office.js.
 */

/** Sin tildes, en minúsculas y con los espacios simples. */
function normalizar(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface TipoRango {
  tipo: string;
  /** Palabras (normalizadas) que, al principio de una palabra del grupo o del nombre, lo identifican. */
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
export const BIBLIOTECA_RANGOS: readonly (TipoRango & { nota: string })[] = [
  { tipo: 'Trámites y permisos', claves: ['tramite', 'permiso', 'licencia', 'aprobacion', 'consulta previa', 'radicacion'], menos: 0.1, mas: 0.6, nota: 'Dependen de terceros: la cola larga es la norma.' },
  { tipo: 'Diseño y estudios', claves: ['diseno', 'estudio', 'ingenieria', 'topografia', 'planos'], menos: 0.1, mas: 0.3, nota: 'Revisiones y cambios del cliente.' },
  { tipo: 'Suministros e importaciones', claves: ['suministro', 'fabricacion', 'compra', 'importacion', 'pedido', 'entrega de equipos'], menos: 0.05, mas: 0.4, nota: 'Plazos de fábrica, transporte y aduana.' },
  { tipo: 'Movimiento de tierras y cimentación', claves: ['excavacion', 'cimentacion', 'movimiento de tierra', 'pilotaje', 'relleno', 'adecuacion del terreno'], menos: 0.1, mas: 0.4, nota: 'El subsuelo y el clima.' },
  { tipo: 'Obra gris y estructura', claves: ['obra gris', 'estructura', 'mamposteria', 'cubierta', 'concreto', 'obra civil', 'muro', 'desencofrado'], menos: 0.1, mas: 0.3, nota: 'Rendimiento de cuadrillas y clima.' },
  { tipo: 'Instalaciones', claves: ['instalacion', 'electric', 'hidraulic', 'sanitari', 'redes', 'mecanic'], menos: 0.1, mas: 0.3, nota: 'Coordinación entre oficios.' },
  { tipo: 'Acabados', claves: ['acabado', 'pintura', 'fachada', 'carpinteria', 'enchape', 'limpieza'], menos: 0.05, mas: 0.25, nota: 'Trabajo repetitivo, pero al final de la obra.' },
  { tipo: 'Pruebas y puesta en marcha', claves: ['prueba', 'puesta en marcha', 'comisionamiento', 'certificacion'], menos: 0.1, mas: 0.4, nota: 'Lo que falla se repara y se vuelve a probar.' },
  { tipo: 'Desarrollo de software', claves: ['desarrollo', 'programacion', 'software', 'integracion', 'migracion', 'sprint'], menos: 0.15, mas: 0.5, nota: 'Requisitos que cambian y deuda técnica.' },
];

export const RANGO_POR_DEFECTO = { menos: 0.1, mas: 0.25 } as const;

/** El primer tipo con una palabra clave al principio de alguna palabra del grupo o del nombre. */
export function tipoDe(tipos: readonly TipoRango[], grupo: unknown, nombre: unknown): TipoRango | undefined {
  const t = ` ${normalizar(grupo)} ${normalizar(nombre)} `.replace(/[^a-z0-9ñ]+/g, ' ');
  return tipos.find((x) => x.claves.some((c) => t.includes(` ${c.replace(/[^a-z0-9ñ]+/g, ' ').trim()}`)));
}
