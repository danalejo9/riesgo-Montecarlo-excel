/**
 * Las reglas de Excel para decidir **qué valores participan** en una función
 * de agregación, que no son las que uno supondría.
 *
 * Con `A1=VERDADERO`, `A2="5"`, `A3` vacía y `A4=10`:
 *
 * ```
 * SUMA(A1:A4)    -> 10    en un rango solo cuentan los números
 * SUMA(A1;A2;A4) -> 16    sueltos, el lógico vale 1 y el texto "5" se convierte
 * CONTAR(A1:A4)  -> 1     cuenta números; ni lógicos, ni texto, ni vacías
 * CONTARA(A1:A4) -> 3     cuenta todo lo que no esté vacío
 * PROMEDIO(A1:A4)-> 10    el mismo conjunto que SUMA, dividido por 1, no por 4
 * ```
 *
 * La última línea es el hueco que este módulo cierra: el motor antiguo dividía
 * por el número de celdas del rango, contando las vacías, y daba 2,5 donde
 * Excel da 10 (casos L0-031 y L0-032 del libro de fidelidad).
 *
 * Un error dentro de un rango se propaga en `SUMA` pero se ignora en `CONTAR`;
 * un error en un argumento suelto se propaga siempre. De ahí que las reglas
 * sean un parámetro y no una constante.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import {
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  numeroEn,
  textoEn,
  errorEn,
  tipoEn,
  type Columna,
} from '../values/columna.ts';
import { numeroDeTexto } from '../values/coercion.ts';
import type { Argumento } from './types.ts';

export interface ReglasAgregacion {
  /** Un error dentro de un rango: `SUMA` lo propaga, `CONTAR` lo ignora. */
  erroresDeRango: 'propagar' | 'ignorar';
  /** Un texto suelto no convertible: `SUMA("x")` es #¡VALOR!, `CONTAR("x")` es 0. */
  textoSueltoNoNumerico: 'error' | 'ignorar';
}

/** Para `SUMA`, `PROMEDIO`, `MIN`, `MAX`, `PRODUCTO`, `DESVEST`, `MEDIANA`. */
export const REGLAS_CALCULO: ReglasAgregacion = {
  erroresDeRango: 'propagar',
  textoSueltoNoNumerico: 'error',
};

/** Para `CONTAR`, que ignora lo que no sepa contar en vez de fallar. */
export const REGLAS_CONTEO: ReglasAgregacion = {
  erroresDeRango: 'ignorar',
  textoSueltoNoNumerico: 'ignorar',
};

/**
 * Recorre los valores que participan en la agregación en la iteración `i`,
 * llamando a `visita` con cada número. Devuelve el código de error a propagar,
 * o `undefined` si no hay ninguno.
 */
export function recorrerNumeros(
  args: readonly Argumento[],
  i: number,
  reglas: ReglasAgregacion,
  visita: (x: number) => void,
): ErrorExcel | undefined {
  for (const arg of args) {
    for (const c of arg.columnas) {
      const err = visitarValor(c, i, arg.esRango, reglas, visita);
      if (err) return err;
    }
  }
  return undefined;
}

function visitarValor(
  c: Columna,
  i: number,
  esRango: boolean,
  reglas: ReglasAgregacion,
  visita: (x: number) => void,
): ErrorExcel | undefined {
  switch (tipoEn(c, i)) {
    case NUMERO:
      visita(numeroEn(c, i));
      return undefined;

    case ERROR: {
      const e = errorEn(c, i) ?? '#VALUE!';
      // En un rango, CONTAR pasa por encima del error; SUMA no.
      if (esRango && reglas.erroresDeRango === 'ignorar') return undefined;
      return e;
    }

    case VACIO:
      // Una celda vacía nunca participa, ni suelta ni en rango. Un argumento
      // omitido (`SUMA(1;;3)`) no llega aquí como vacío: el evaluador lo
      // convierte en un 0 explícito, que es lo que hace Excel.
      return undefined;

    case LOGICO:
      if (esRango) return undefined; // en un rango, los lógicos se ignoran
      visita(numeroEn(c, i) !== 0 ? 1 : 0);
      return undefined;

    case TEXTO: {
      if (esRango) return undefined; // en un rango, el texto se ignora
      const x = numeroDeTexto(textoEn(c, i) ?? '');
      if (x === undefined) return reglas.textoSueltoNoNumerico === 'error' ? '#VALUE!' : undefined;
      visita(x);
      return undefined;
    }
  }
}

/**
 * `CONTARA`: cuenta todo lo que no esté vacío, errores incluidos, y nunca
 * falla. Un texto vacío `""` devuelto por una fórmula **sí** cuenta — no es
 * una celda vacía, aunque se vea igual.
 */
export function contarNoVacios(args: readonly Argumento[], i: number): number {
  let cuenta = 0;
  for (const arg of args) {
    for (const c of arg.columnas) {
      if (tipoEn(c, i) !== VACIO) cuenta++;
    }
  }
  return cuenta;
}

/**
 * Camino rápido: los `Float64Array` de todos los argumentos si **todos** son
 * columnas puramente numéricas, o `null` si alguno no lo es.
 *
 * Es lo que mantiene el bucle plano de antes del canal de valores en el caso
 * dominante (un modelo de presupuesto sin texto en los rangos agregados): se
 * comprueba una vez por llamada, no una vez por iteración. Cuando devuelve un
 * array, el llamante sabe que no hay errores, ni vacíos, ni lógicos que
 * filtrar, y puede sumar sin preguntar nada más.
 */
export function vectoresNumericos(args: readonly Argumento[]): Float64Array[] | null {
  const out: Float64Array[] = [];
  for (const arg of args) {
    for (const c of arg.columnas) {
      if (c.forma !== 'vector' || c.tipo !== NUMERO) return null;
      out.push(c.datos);
    }
  }
  return out;
}
