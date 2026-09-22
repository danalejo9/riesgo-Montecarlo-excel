/**
 * Modelo de valores del motor: los cinco tipos de celda de Excel, vectorizados.
 *
 * Sustituye al subconjunto puramente numérico con el que se construyó el Nivel
 * 0 (el antiguo `engine/functions/types.ts`), que trataba toda celda como un
 * `Float64Array` y no sabía distinguir una celda vacía de un cero ni
 * representar un texto. Esa limitación estaba documentada como aplazada, y es
 * la causa raíz común de los seis casos pendientes del libro de fidelidad y de
 * que no se pudieran implementar `SUMIF`/`COUNTIF`/`AVERAGEIFS`, que comparan
 * celdas contra un criterio.
 *
 * ---
 *
 * **La tensión de diseño, y cómo se resuelve.**
 *
 * Una `Columna` son los N valores que toma una celda a lo largo de las N
 * iteraciones de la simulación. Modelar cada valor como un objeto etiquetado
 * costaría un millón de objetos por celda: inaceptable, el motor existe
 * precisamente para recorrer memoria contigua (Fase 2 §3).
 *
 * La observación que lo resuelve: en un modelo real, **el tipo de una celda
 * casi nunca varía entre iteraciones**. Una etiqueta de texto es texto en las
 * N; una celda vacía está vacía en las N; una suma es número en las N. Solo
 * una fórmula como `SI(A1>10;"alto";5)` produce tipos distintos según la
 * iteración, y es el caso raro.
 *
 * De ahí las tres formas de abajo: dos representaciones compactas para los
 * casos frecuentes (un vector numérico plano; un único valor repetido) y una
 * general, más cara, para la mezcla. Las funciones no ramifican sobre la forma
 * a mano: usan los accesores de este archivo, y `comoVectorNumerico` cuando
 * quieren el camino rápido.
 *
 * **Invariante**: una columna `mixta` está de verdad mezclada. Los
 * constructores colapsan a `vector` o `constante` en cuanto el contenido
 * resulta homogéneo, así que la forma es información fiable y el camino rápido
 * se toma siempre que es aplicable.
 */

import type { ErrorExcel } from '../parser/ast.ts';

export const NUMERO = 0;
export const TEXTO = 1;
export const LOGICO = 2;
export const VACIO = 3;
export const ERROR = 4;

export type TipoValor = typeof NUMERO | typeof TEXTO | typeof LOGICO | typeof VACIO | typeof ERROR;

export const NOMBRE_TIPO: Record<TipoValor, string> = {
  [NUMERO]: 'número',
  [TEXTO]: 'texto',
  [LOGICO]: 'lógico',
  [VACIO]: 'vacío',
  [ERROR]: 'error',
};

/** Un único valor de celda, fuera del contexto vectorizado. */
export type ValorEscalar =
  | { tipo: typeof NUMERO; numero: number }
  | { tipo: typeof LOGICO; numero: number }
  | { tipo: typeof TEXTO; texto: string }
  | { tipo: typeof VACIO }
  | { tipo: typeof ERROR; error: ErrorExcel };

/**
 * Los N valores de una celda a lo largo de la simulación.
 *
 * - `vector`: N números (o N lógicos, guardados como 1/0). El caso dominante y
 *   el único que recorren los bucles planos del registro de funciones.
 * - `constante`: el mismo valor no numérico en las N iteraciones. Solo
 *   texto, vacío y error: un número constante se guarda como `vector`, para
 *   que no haya dos formas de decir lo mismo.
 * - `mixta`: el tipo cambia según la iteración. `tipos[i]` manda; `numeros[i]`
 *   vale para NUMERO y LOGICO; `laterales[i]` guarda el texto o el código de
 *   error (se distinguen por `tipos[i]`, nunca por el contenido).
 */
export type Columna =
  | {
      forma: 'vector';
      tipo: typeof NUMERO | typeof LOGICO;
      datos: Float64Array;
      /**
       * `true` si se sabe que las N posiciones valen lo mismo.
       *
       * Lo ponen los constructores que rellenan un único valor y la difusión
       * de una celda constante del compilador: en esos casos la invariancia es
       * un hecho conocido, no algo que haya que redescubrir recorriendo el
       * array. Ausente significa "no consta", nunca "varía".
       *
       * Existe porque redescubrirlo cuesta O(N) y hay funciones —las
       * búsquedas, las de criterio— que pueden precalcular muchísimo trabajo
       * cuando sus datos no cambian entre iteraciones. Sin esta bandera,
       * `BUSCARV` sobre una tabla de 100 filas tardaba 281 s en un millón de
       * iteraciones, medido.
       */
      invariante?: boolean;
    }
  | { forma: 'constante'; n: number; valor: ValorEscalar }
  | {
      forma: 'mixta';
      n: number;
      tipos: Uint8Array;
      numeros: Float64Array;
      laterales: (string | undefined)[];
    };

// --- Constructores -------------------------------------------------------

export function vectorNumerico(datos: Float64Array): Columna {
  return { forma: 'vector', tipo: NUMERO, datos };
}

export function vectorLogico(datos: Float64Array): Columna {
  return { forma: 'vector', tipo: LOGICO, datos };
}

export function numeroConstante(valor: number, n: number): Columna {
  const datos = new Float64Array(n);
  datos.fill(valor);
  return { forma: 'vector', tipo: NUMERO, datos, invariante: true };
}

export function logicoConstante(valor: boolean, n: number): Columna {
  const datos = new Float64Array(n);
  datos.fill(valor ? 1 : 0);
  return { forma: 'vector', tipo: LOGICO, datos, invariante: true };
}

/**
 * Si consta que la columna vale lo mismo en todas las iteraciones.
 *
 * Es deliberadamente conservadora: `false` significa "no consta", no "varía".
 * Quien la use para saltarse trabajo tiene que seguir siendo correcto cuando
 * devuelve `false` sobre una columna que en realidad era constante.
 */
export function esInvariante(c: Columna): boolean {
  return c.forma === 'constante' || (c.forma === 'vector' && c.invariante === true);
}

export function textoConstante(texto: string, n: number): Columna {
  return { forma: 'constante', n, valor: { tipo: TEXTO, texto } };
}

export function vacioConstante(n: number): Columna {
  return { forma: 'constante', n, valor: { tipo: VACIO } };
}

export function errorConstante(error: ErrorExcel, n: number): Columna {
  return { forma: 'constante', n, valor: { tipo: ERROR, error } };
}

/** Repite un `ValorEscalar` en las N iteraciones, en la forma que le toque. */
export function desdeEscalar(valor: ValorEscalar, n: number): Columna {
  switch (valor.tipo) {
    case NUMERO:
      return numeroConstante(valor.numero, n);
    case LOGICO:
      return logicoConstante(valor.numero !== 0, n);
    case TEXTO:
      return textoConstante(valor.texto, n);
    case VACIO:
      return vacioConstante(n);
    case ERROR:
      return errorConstante(valor.error, n);
  }
}

// --- Accesores -----------------------------------------------------------

export function largoDe(c: Columna): number {
  return c.forma === 'vector' ? c.datos.length : c.n;
}

export function tipoEn(c: Columna, i: number): TipoValor {
  switch (c.forma) {
    case 'vector':
      return c.tipo;
    case 'constante':
      return c.valor.tipo;
    case 'mixta':
      return c.tipos[i] as TipoValor;
  }
}

/**
 * Valor numérico crudo en `i`, **sin** coerción: `NaN` si la celda no es un
 * número ni un lógico. Para la coerción aritmética de Excel (vacío→0,
 * texto numérico→su número, error→se propaga) ver `coercion.ts`.
 */
export function numeroEn(c: Columna, i: number): number {
  switch (c.forma) {
    case 'vector':
      return c.datos[i] as number;
    case 'constante':
      return c.valor.tipo === NUMERO || c.valor.tipo === LOGICO ? c.valor.numero : NaN;
    case 'mixta': {
      const t = c.tipos[i];
      return t === NUMERO || t === LOGICO ? (c.numeros[i] as number) : NaN;
    }
  }
}

export function textoEn(c: Columna, i: number): string | undefined {
  switch (c.forma) {
    case 'vector':
      return undefined;
    case 'constante':
      return c.valor.tipo === TEXTO ? c.valor.texto : undefined;
    case 'mixta':
      return c.tipos[i] === TEXTO ? c.laterales[i] : undefined;
  }
}

export function errorEn(c: Columna, i: number): ErrorExcel | undefined {
  switch (c.forma) {
    case 'vector':
      return undefined;
    case 'constante':
      return c.valor.tipo === ERROR ? c.valor.error : undefined;
    case 'mixta':
      return c.tipos[i] === ERROR ? (c.laterales[i] as ErrorExcel | undefined) : undefined;
  }
}

export function esVacioEn(c: Columna, i: number): boolean {
  return tipoEn(c, i) === VACIO;
}

/** El valor completo en `i`, para cuando hace falta pasarlo tal cual. */
export function valorEn(c: Columna, i: number): ValorEscalar {
  const t = tipoEn(c, i);
  switch (t) {
    case NUMERO:
      return { tipo: NUMERO, numero: numeroEn(c, i) };
    case LOGICO:
      return { tipo: LOGICO, numero: numeroEn(c, i) };
    case TEXTO:
      return { tipo: TEXTO, texto: textoEn(c, i) ?? '' };
    case VACIO:
      return { tipo: VACIO };
    case ERROR:
      return { tipo: ERROR, error: errorEn(c, i) ?? '#VALUE!' };
  }
}

/**
 * Camino rápido: el `Float64Array` subyacente si la columna es puramente
 * numérica, o `null` si no lo es.
 *
 * Es lo que permite que `SUM` sobre un modelo sin texto siga siendo el mismo
 * bucle plano de antes del canal de valores: se comprueba una vez por
 * argumento, no una vez por iteración. Los lógicos quedan fuera a propósito —
 * `SUMA` no suma un TRUE que esté en un rango, así que tratarlos como 1/0 en
 * el camino rápido daría un resultado distinto al de Excel.
 */
export function comoVectorNumerico(c: Columna): Float64Array | null {
  return c.forma === 'vector' && c.tipo === NUMERO ? c.datos : null;
}

// --- Construcción valor a valor -----------------------------------------

/**
 * Acumulador para construir una columna cuando el tipo puede variar por
 * iteración (el caso de `SI(A1>10;"alto";5)`).
 *
 * Escribe en arrays preasignados en vez de crear un objeto por valor, y al
 * cerrar colapsa a la forma más compacta que el contenido permita — de modo
 * que el caso frecuente (todas las ramas numéricas) no deja rastro de haber
 * pasado por aquí.
 */
export interface ConstructorColumna {
  ponerNumero(i: number, x: number): void;
  ponerLogico(i: number, b: boolean): void;
  ponerTexto(i: number, s: string): void;
  ponerVacio(i: number): void;
  ponerError(i: number, e: ErrorExcel): void;
  ponerValor(i: number, v: ValorEscalar): void;
  terminar(): Columna;
}

export function crearConstructor(n: number): ConstructorColumna {
  const tipos = new Uint8Array(n); // NUMERO = 0, así que arranca todo en número
  const numeros = new Float64Array(n);
  let laterales: (string | undefined)[] | null = null;

  const lateral = (): (string | undefined)[] => {
    if (!laterales) laterales = new Array<string | undefined>(n);
    return laterales;
  };

  return {
    ponerNumero(i, x) {
      tipos[i] = NUMERO;
      numeros[i] = x;
    },
    ponerLogico(i, b) {
      tipos[i] = LOGICO;
      numeros[i] = b ? 1 : 0;
    },
    ponerTexto(i, s) {
      tipos[i] = TEXTO;
      lateral()[i] = s;
    },
    ponerVacio(i) {
      tipos[i] = VACIO;
    },
    ponerError(i, e) {
      tipos[i] = ERROR;
      lateral()[i] = e;
    },
    ponerValor(i, v) {
      switch (v.tipo) {
        case NUMERO:
          this.ponerNumero(i, v.numero);
          break;
        case LOGICO:
          this.ponerLogico(i, v.numero !== 0);
          break;
        case TEXTO:
          this.ponerTexto(i, v.texto);
          break;
        case VACIO:
          this.ponerVacio(i);
          break;
        case ERROR:
          this.ponerError(i, v.error);
          break;
      }
    },
    terminar(): Columna {
      return normalizar(n, tipos, numeros, laterales);
    },
  };
}

/**
 * Colapsa a la forma más compacta posible. Un solo recorrido: en cuanto
 * aparecen dos tipos distintos, la columna es mixta y no hay más que decidir.
 */
function normalizar(
  n: number,
  tipos: Uint8Array,
  numeros: Float64Array,
  laterales: (string | undefined)[] | null,
): Columna {
  if (n === 0) return vectorNumerico(numeros);

  const primero = tipos[0] as TipoValor;
  for (let i = 1; i < n; i++) {
    if (tipos[i] !== primero) return { forma: 'mixta', n, tipos, numeros, laterales: laterales ?? [] };
  }

  // Tipo homogéneo. Los numéricos ya están en su forma final; los demás solo
  // colapsan si además el contenido es el mismo en todas las iteraciones.
  switch (primero) {
    case NUMERO:
      return vectorNumerico(numeros);
    case LOGICO:
      return vectorLogico(numeros);
    case VACIO:
      return vacioConstante(n);
    case TEXTO:
    case ERROR: {
      const lat = laterales ?? [];
      const uno = lat[0];
      for (let i = 1; i < n; i++) {
        if (lat[i] !== uno) return { forma: 'mixta', n, tipos, numeros, laterales: lat };
      }
      return primero === TEXTO
        ? textoConstante(uno ?? '', n)
        : errorConstante((uno as ErrorExcel) ?? '#VALUE!', n);
    }
  }
}
