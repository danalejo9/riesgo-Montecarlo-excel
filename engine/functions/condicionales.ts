/**
 * `SUMAR.SI`, `CONTAR.SI`, `PROMEDIO.SI` y sus variantes `.CONJUNTO`.
 *
 * Son, con diferencia, las funciones de Nivel 1 que más pesan en un modelo de
 * presupuesto real: 3.183 usos en el libro que el usuario pasó por el escáner
 * (`Humedales_v1_completo`, 132 hojas), repartidos entre `SUMAR.SI.CONJUNTO`
 * (1.666), `CONTAR.SI` (1.052), `PROMEDIO.SI.CONJUNTO` (396) y `SUMAR.SI` (69).
 *
 * **Ojo con el orden de los argumentos**, que Excel cambia entre las dos
 * familias y es una fuente clásica de errores:
 *
 * ```
 * SUMAR.SI(rango_criterio; criterio; [rango_suma])
 * SUMAR.SI.CONJUNTO(rango_suma; rango_criterio1; criterio1; ...)
 * ```
 *
 * **Rendimiento.** Comprobar cada criterio contra cada celda en cada una de un
 * millón de iteraciones sería inviable. La observación que lo salva: en un
 * modelo real los rangos de criterio son etiquetas —categorías, códigos,
 * nombres de capítulo— que no cambian entre iteraciones, y el criterio suele
 * ser una constante de la fórmula. Cuando es así (todas las columnas
 * implicadas son constantes en el sentido de `Columna`), el conjunto de
 * posiciones que coinciden se calcula **una sola vez** y las iteraciones solo
 * recorren los valores que hay que sumar. Si algún criterio sí depende de la
 * simulación, se recalcula por iteración, que es lo correcto aunque cueste.
 *
 * **Límite conocido**: Excel redimensiona el rango de suma para que case con
 * el de criterio cuando no miden lo mismo (`SUMAR.SI(A1:A9;">0";B1)` funciona
 * y suma `B1:B9`). Aquí se exige que midan igual y, si no, se devuelve
 * `#¡VALOR!` en vez de adivinar. Preferible a sumar celdas que el usuario no
 * escribió.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import {
  crearConstructor,
  errorEn,
  numeroEn,
  tipoEn,
  valorEn,
  vectorNumerico,
  ERROR,
  NUMERO,
  type Columna,
} from '../values/columna.ts';
import { compilarCriterio, cumple, type Criterio } from './criterios.ts';
import type { Argumento } from './types.ts';

/** Un rango de criterio con el criterio que se le aplica. */
interface Par {
  rango: Columna[];
  criterio: Columna | undefined;
}

type Modo = 'suma' | 'cuenta' | 'promedio' | 'maximo' | 'minimo';

/** Una columna constante vale lo mismo en todas las iteraciones. */
function esInvariante(c: Columna | undefined): boolean {
  return c !== undefined && c.forma === 'constante';
}

function columnaDeError(e: ErrorExcel, n: number): Columna {
  const b = crearConstructor(n);
  for (let i = 0; i < n; i++) b.ponerError(i, e);
  return b.terminar();
}

function agregarCondicional(
  n: number,
  pares: Par[],
  objetivo: Columna[],
  modo: Modo,
): Columna {
  if (pares.length === 0) return columnaDeError('#VALUE!', n);

  const largo = (pares[0] as Par).rango.length;
  for (const p of pares) {
    if (p.rango.length !== largo || p.criterio === undefined) return columnaDeError('#VALUE!', n);
  }
  if (modo !== 'cuenta' && objetivo.length !== largo) return columnaDeError('#VALUE!', n);

  // Si nada de lo que decide la coincidencia cambia entre iteraciones, se
  // resuelve una vez. Es el caso normal: los rangos de criterio son etiquetas.
  const fijo = pares.every((p) => esInvariante(p.criterio) && p.rango.every(esInvariante));
  const coincidenciasFijas = fijo ? posicionesQueCoinciden(pares, 0, largo) : null;

  // `CONTAR.SI` con todo fijo da el mismo número en todas las iteraciones.
  if (coincidenciasFijas && modo === 'cuenta') {
    const out = new Float64Array(n);
    out.fill(coincidenciasFijas.length);
    return vectorNumerico(out);
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const coincidencias = coincidenciasFijas ?? posicionesQueCoinciden(pares, i, largo);

    if (modo === 'cuenta') {
      salida.ponerNumero(i, coincidencias.length);
      continue;
    }

    let acumulado = 0;
    let cuenta = 0;
    let extremo = modo === 'maximo' ? -Infinity : Infinity;
    let error: ErrorExcel | undefined;

    for (const k of coincidencias) {
      const c = objetivo[k] as Columna;
      const tipo = tipoEn(c, i);
      if (tipo === ERROR) {
        error = errorEn(c, i) ?? '#VALUE!';
        break;
      }
      // Como en SUMA sobre un rango: solo los números participan.
      if (tipo !== NUMERO) continue;
      const x = numeroEn(c, i);
      acumulado += x;
      cuenta++;
      if (modo === 'maximo' ? x > extremo : x < extremo) extremo = x;
    }

    if (error) salida.ponerError(i, error);
    else if (modo === 'maximo' || modo === 'minimo') {
      // Sin ninguna coincidencia, 0 y no un error: es lo que hace Excel con
      // MAX.SI.CONJUNTO, igual que MAX de un rango sin números.
      salida.ponerNumero(i, cuenta === 0 ? 0 : extremo);
    } else if (modo === 'promedio') {
      if (cuenta === 0) salida.ponerError(i, '#DIV/0!');
      else salida.ponerNumero(i, acumulado / cuenta);
    } else {
      salida.ponerNumero(i, acumulado);
    }
  }
  return salida.terminar();
}

function posicionesQueCoinciden(pares: Par[], i: number, largo: number): number[] {
  const compilados: Criterio[] = pares.map((p) => compilarCriterio(valorEn(p.criterio as Columna, i)));

  const out: number[] = [];
  for (let k = 0; k < largo; k++) {
    let todas = true;
    for (let j = 0; j < pares.length && todas; j++) {
      const p = pares[j] as Par;
      if (!cumple(compilados[j] as Criterio, p.rango[k] as Columna, i)) todas = false;
    }
    if (todas) out.push(k);
  }
  return out;
}

/** Extrae los pares (rango, criterio) a partir de `desde`, de dos en dos. */
function paresDesde(args: Argumento[], desde: number): Par[] {
  const pares: Par[] = [];
  for (let a = desde; a + 1 < args.length; a += 2) {
    pares.push({
      rango: (args[a] as Argumento).columnas,
      criterio: (args[a + 1] as Argumento).columnas[0],
    });
  }
  return pares;
}

// --- Las seis funciones --------------------------------------------------

/** `SUMAR.SI(rango; criterio; [rango_suma])`. */
export function SUMIF(args: Argumento[], n: number): Columna {
  const rango = args[0]?.columnas ?? [];
  const criterio = args[1]?.columnas[0];
  const objetivo = args[2]?.columnas ?? rango;
  return agregarCondicional(n, [{ rango, criterio }], objetivo, 'suma');
}

/** `SUMAR.SI.CONJUNTO(rango_suma; rango_criterio1; criterio1; ...)`. */
export function SUMIFS(args: Argumento[], n: number): Columna {
  const objetivo = args[0]?.columnas ?? [];
  return agregarCondicional(n, paresDesde(args, 1), objetivo, 'suma');
}

/** `CONTAR.SI(rango; criterio)`. */
export function COUNTIF(args: Argumento[], n: number): Columna {
  const rango = args[0]?.columnas ?? [];
  const criterio = args[1]?.columnas[0];
  return agregarCondicional(n, [{ rango, criterio }], [], 'cuenta');
}

/** `CONTAR.SI.CONJUNTO(rango1; criterio1; ...)`. */
export function COUNTIFS(args: Argumento[], n: number): Columna {
  return agregarCondicional(n, paresDesde(args, 0), [], 'cuenta');
}

/** `PROMEDIO.SI(rango; criterio; [rango_promedio])`. */
export function AVERAGEIF(args: Argumento[], n: number): Columna {
  const rango = args[0]?.columnas ?? [];
  const criterio = args[1]?.columnas[0];
  const objetivo = args[2]?.columnas ?? rango;
  return agregarCondicional(n, [{ rango, criterio }], objetivo, 'promedio');
}

/** `PROMEDIO.SI.CONJUNTO(rango_promedio; rango_criterio1; criterio1; ...)`. */
export function AVERAGEIFS(args: Argumento[], n: number): Columna {
  const objetivo = args[0]?.columnas ?? [];
  return agregarCondicional(n, paresDesde(args, 1), objetivo, 'promedio');
}

/**
 * `MAX.SI.CONJUNTO(rango_max; rango1; criterio1; …)`: el mayor de los valores
 * cuyas filas cumplen todos los criterios. Mismo orden de argumentos que
 * `SUMAR.SI.CONJUNTO`: el rango del que se toma el valor va primero.
 */
export function MAXIFS(args: Argumento[], n: number): Columna {
  const objetivo = args[0]?.columnas ?? [];
  return agregarCondicional(n, paresDesde(args, 1), objetivo, 'maximo');
}

/** `MIN.SI.CONJUNTO(rango_min; rango1; criterio1; …)`. */
export function MINIFS(args: Argumento[], n: number): Columna {
  const objetivo = args[0]?.columnas ?? [];
  return agregarCondicional(n, paresDesde(args, 1), objetivo, 'minimo');
}
