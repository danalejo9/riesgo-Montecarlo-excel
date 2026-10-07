/**
 * V6: rellenar los rangos vacíos. Un cronograma importado de MS Project o P6
 * no trae incertidumbre, y sin ella la simulación no enseña nada; esto añade
 * a la hoja Incertidumbre una fila por tarea sin rango (ni propio ni de su
 * grupo), en % de la base, como punto de partida para que el equipo lo afine
 * (el chequeo de calidad avisa mientras los rangos sean todos iguales).
 *
 * Los porcentajes salen de la hoja Rangos_Tipo (una biblioteca editable de
 * rangos habituales por tipo de trabajo, según el grupo o el nombre de la
 * actividad) o, si ningún tipo encaja, de −10 % / +25 %: asimétrico, porque
 * las duraciones se alargan más de lo que se acortan. Nunca toca las
 * terminadas, los hitos ni las excluidas de la simulación. Sin Office.js.
 */

import { BIBLIOTECA_RANGOS, incertidumbreDe, RANGO_POR_DEFECTO, tipoDe, type TipoRango } from '../engine/cronograma/index.ts';
import { COLUMNAS, HOJAS_CRONOGRAMA as H, hojaRangosTipo, leerCronograma, normalizar, numero, texto, vacia, siNo, type Celda, type MatrizHoja } from './cronogramaHojas.ts';
import type { CambioHoja } from './edicionGantt.ts';

/** 0,25, «25 %» o 25 → 0,25. */
function fraccion(v: unknown): number | null {
  const x = numero(v);
  if (x === null) return null;
  return x > 1 ? x / 100 : x;
}

export function leerRangosTipo(m: MatrizHoja | undefined): { tipos: TipoRango[]; problemas: string[] } {
  if (!m || m.length < 2) return { tipos: [], problemas: [] };
  const enc = (m[0] ?? []).map(normalizar);
  const col = (k: string) => enc.findIndex((h) => h.startsWith(normalizar(k)));
  const [cT, cC, cM, cX] = [col('Tipo'), col('Palabras clave'), col('Menos'), col('Más')];
  if (cT < 0 || cM < 0 || cX < 0) return { tipos: [], problemas: [`${H.rangosTipo}: faltan las columnas «Tipo», «Menos» y «Más» en la fila 1`] };
  const tipos: TipoRango[] = [];
  const problemas: string[] = [];
  for (let f = 1; f < m.length; f++) {
    const fila = m[f] ?? [];
    const nombre = texto(fila[cT]);
    if (!nombre) continue;
    const menos = fraccion(fila[cM]);
    const mas = fraccion(fila[cX]);
    if (menos === null || mas === null || menos < 0 || menos >= 1 || mas < 0) {
      problemas.push(`${H.rangosTipo}, fila ${f + 1} («${nombre}»): «Menos» tiene que estar entre 0 % y 99 % y «Más» ser 0 % o más`);
      continue;
    }
    const claves = [nombre, ...(cC >= 0 ? texto(fila[cC]).split(/[,;\n]/) : [])].map(normalizar).filter((x) => x !== '');
    tipos.push({ tipo: nombre, claves: [...new Set(claves)], menos, mas });
  }
  return { tipos, problemas };
}

export type ResultadoRellenar =
  | { ok: true; cambios: CambioHoja[]; actividades: number; porTipo: Record<string, number>; creaBiblioteca: boolean }
  | { ok: false; error: string };

/** Los cambios que rellenan los rangos vacíos (y crean la hoja Rangos_Tipo si falta). */
export function rellenarRangos(hojas: Readonly<Record<string, MatrizHoja | undefined>>): ResultadoRellenar {
  const lectura = leerCronograma(hojas);
  if (!lectura.modelo) return { ok: false, error: 'Corrija primero los errores del cronograma («Revisar calidad» los enseña).' };
  const modelo = lectura.modelo;
  const creaBiblioteca = !hojas[H.rangosTipo];
  const lt = creaBiblioteca ? { tipos: BIBLIOTECA_RANGOS.map((t) => ({ ...t })), problemas: [] } : leerRangosTipo(hojas[H.rangosTipo]);
  if (lt.problemas.length) return { ok: false, error: lt.problemas.join(' ') };

  // Las excluidas de la simulación (su incertidumbre no se usaría).
  const ma = hojas[H.actividades] ?? [];
  const enc = (ma[0] ?? []).map(normalizar);
  const cId = enc.indexOf(normalizar('ID'));
  const cEx = enc.findIndex((h) => h.startsWith('excluir'));
  const excluidas = new Set(cEx < 0 ? [] : ma.slice(1).filter((f) => siNo(f[cEx], false)).map((f) => normalizar(f[cId])));

  const grupos = new Map((modelo.info ?? []).map((i) => [i.id, i.grupo ?? '']));
  const filas: Celda[][] = [];
  const porTipo: Record<string, number> = {};
  for (const a of modelo.red.actividades) {
    if (a.duracion <= 0 || a.avance?.finReal !== undefined || excluidas.has(normalizar(a.id))) continue;
    if (incertidumbreDe(modelo, a.id)) continue;
    const tipo = tipoDe(lt.tipos, grupos.get(a.id), a.nombre);
    if (tipo) porTipo[tipo.tipo] = (porTipo[tipo.tipo] ?? 0) + 1;
    const { menos, mas } = tipo ?? RANGO_POR_DEFECTO;
    filas.push([a.id, 'Triangular', Math.round((1 - menos) * 100), 100, Math.round((1 + mas) * 100), '% de la base', null]);
  }
  const cambios: CambioHoja[] = [];
  if (creaBiblioteca) {
    const b = hojaRangosTipo();
    cambios.push({ hoja: H.rangosTipo, op: 'rango', fila: 0, col: 0, valores: b.valores, antes: b.valores.map((f) => f.map(() => null)), formatos: { 2: '0%', 3: '0%' } });
  }
  if (filas.length) {
    // Debajo de la última fila con algo en la tabla de Incertidumbre.
    const mi = hojas[H.incertidumbre] ?? [];
    let ultima = 0;
    mi.forEach((f, i) => { if (f.slice(0, COLUMNAS.incertidumbre.length).some((x) => !vacia(x))) ultima = i; });
    if (mi.length === 0) cambios.push({ hoja: H.incertidumbre, op: 'rango', fila: 0, col: 0, valores: [[...COLUMNAS.incertidumbre]], antes: [COLUMNAS.incertidumbre.map(() => null)] });
    cambios.push({ hoja: H.incertidumbre, op: 'rango', fila: Math.max(1, ultima + 1), col: 0, valores: filas, antes: filas.map((f) => f.map(() => null)) });
  }
  return { ok: true, cambios, actividades: filas.length, porTipo, creaBiblioteca };
}
