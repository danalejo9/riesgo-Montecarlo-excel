/**
 * Las funciones `RIESGO.*` del libro, resueltas sobre el grafo (B7). Sin
 * Office.js.
 *
 * Hasta el 28/09 una función RIESGO tenía que ser toda la fórmula y con
 * números escritos: `=RIESGO.NORMAL(100; 15)`. Ahora cada llamada cae en uno
 * de tres casos:
 *
 * 1. **Toda la fórmula, con argumentos fijos** (`=RIESGO.NORMAL(B2; 15)` con
 *    B2 sin nada aleatorio detrás). Los argumentos se calculan una vez con el
 *    propio motor y la celda es una entrada como las del panel: vale para los
 *    dos motores, compartir, tornado… Es el caso de siempre, ampliado.
 * 2. **Dentro de una operación, con argumentos fijos** (`=1+RIESGO.NORMAL(0;
 *    1)`). La llamada se sustituye por una **celda virtual** que es una
 *    entrada con esa distribución. Solo el motor rápido.
 * 3. **Parámetros que cambian en cada iteración** (`=RIESGO.NORMAL(C4; 10)`
 *    con C4 aleatoria). La llamada se sustituye por
 *    `_RIESGO.CUANTIL(u; "NORMAL"; C4; 10)`, con `u` una celda virtual
 *    uniforme (0,1): el motor calcula la muestra con los parámetros de esa
 *    iteración (ver `functions/riesgo.ts`). Solo el motor rápido.
 *
 * «Aleatorio» es: depender, directa o indirectamente, de una entrada del panel
 * o de otra celda con una función RIESGO.
 *
 * Las celdas virtuales tienen una hoja que no puede existir (empieza por un
 * carácter de control), así que no chocan con nada del libro.
 */

import type { Grafo } from '../graph/graph.ts';
import { reemplazarAst, referenciasDe } from '../graph/graph.ts';
import { clausuraDependencias, clausuraDependientes } from '../graph/subgraph.ts';
import { ordenarTopologicamente } from '../graph/toposort.ts';
import { evaluarNodo } from '../compiler/evaluate.ts';
import { NOMBRE_CUANTIL } from '../functions/riesgo.ts';
import { claveCelda, recorrer, type Nodo } from '../parser/ast.ts';
import { coercionNumerica } from '../values/coercion.ts';
import { desdeEscalar, valorEn, vacioConstante, NUMERO, TEXTO, LOGICO, type Columna } from '../values/columna.ts';
import type { DistributionSpec } from './distributionSchema.ts';
import {
  esFuncionDeDeclaracion,
  esFuncionDeResultado,
  esFuncionParametrica,
  FUNCION_EVENTO,
  FUNCION_TRUNCAR,
  idDeFuncionRiesgo,
  leerNodoRiesgo,
  type EvaluadorDeArgumento,
  type LectorDeRango,
} from './funcionesRiesgo.ts';
import type { EntradaRiskModel } from './riskModel.ts';

/** Prefijo del id de las entradas de apoyo (el uniforme de los parámetros que cambian). */
export const PREFIJO_DINAMICA = 'rd_';
/** Prefijo del id de las entradas que vienen de una función RIESGO del libro. */
export const PREFIJO_FUNCION = 'rf_';

const LIMITE_CELDAS_RANGO = 1_000;

export interface OpcionesRiesgoEnGrafo {
  clavesEntradaPanel: readonly string[];
  clavesSalida: readonly string[];
  /** Todas las celdas con RIESGO, dependan o no de las salidas (para compartir). */
  todas?: boolean;
  /** El nombre legible de una celda (E5). */
  nombrar?: (clave: string, hoja: string, col: number, fila: number) => string;
}

export interface ConversionRiesgo {
  clave: string;
  hoja: string;
  col: number;
  fila: number;
  spec: DistributionSpec;
  /** Lo que la celda enseña fuera de la simulación: la media, o el valor más probable. */
  media: number | string;
}

export interface RiesgoEnGrafo {
  /** Entradas nuevas para esta simulación: las celdas del caso 1 y las virtuales. */
  entradas: EntradaRiskModel[];
  /** La clave del grafo de cada entrada, en el mismo orden. */
  claves: string[];
  /** Referencia de cada entrada → su clave (las virtuales no son celdas del libro). */
  claveDeRef: Map<string, string>;
  /** La celda del libro de cada entrada (para pintarla y para listarla). */
  celdaDeEntrada: Map<string, string>;
  /** Descripción legible de las entradas de apoyo, cuya distribución es un uniforme técnico. */
  descripciones: Map<string, string>;
  /** Celdas del caso 1: se pueden convertir en entradas del panel al compartir. */
  conversiones: ConversionRiesgo[];
  /** Celdas de los casos 2 y 3: su fórmula se reescribe y solo las simula el motor rápido. */
  reescritas: string[];
  reescrituras: Map<string, Nodo>;
  /** Por qué se reescribió cada celda, en palabras del usuario. */
  motivosReescritura: Map<string, string>;
  /**
   * Celdas reescritas que el modo compatible **no** puede simular (B1b), con
   * el motivo. Las demás las simula Excel: su función devuelve en cada
   * iteración el sorteo que le toca.
   */
  noCompatibles: Map<string, string>;
  errores: string[];
  /** Celdas que están en el panel y además tienen RIESGO: manda el panel. */
  duplicadas: string[];
  /** Celdas con `RIESGO.EVENTO` (T8), ya expandidas a BERNOULLI × impacto. */
  eventos: string[];
}

/**
 * T8: cada `RIESGO.EVENTO(p; impacto)` pasa a ser `RIESGO.BERNOULLI(p) *
 * (impacto)`, que el análisis ya sabe tratar (una función dentro de una
 * operación). Cambia el grafo. Devuelve las celdas cambiadas.
 */
export function expandirEventos(grafo: Grafo): string[] {
  const celdas: string[] = [];
  for (const [clave, nodo] of grafo.nodos) {
    if (!nodo.ast) continue;
    let hay = false;
    const t = (n: Nodo): Nodo => {
      if (n.tipo === 'funcion' && idDeFuncionRiesgo(n.nombre) === FUNCION_EVENTO.id && n.args.length === 2) {
        hay = true;
        const [p, x] = n.args as [Nodo, Nodo];
        return {
          tipo: 'binaria',
          op: '*',
          izq: { tipo: 'funcion', nombre: 'RIESGO.BERNOULLI', args: [t(p)], pos: n.pos },
          der: t(x),
          pos: n.pos,
        };
      }
      return mapearHijos(n, t);
    };
    const nuevo = t(nodo.ast);
    if (hay) {
      reemplazarAst(grafo, clave, nuevo);
      celdas.push(clave);
    }
  }
  return celdas;
}

/** ¿Es este nodo una llamada a una distribución RIESGO (no a una de resultados)? */
export function esLlamadaDistribucion(n: Nodo): n is Extract<Nodo, { tipo: 'funcion' }> {
  if (n.tipo !== 'funcion') return false;
  const id = idDeFuncionRiesgo(n.nombre);
  return id !== null && !esFuncionDeResultado(id) && !esFuncionDeDeclaracion(id);
}

/** ¿Contiene el AST alguna llamada a una distribución RIESGO? */
export function contieneDistribucion(ast: Nodo): boolean {
  let hay = false;
  recorrer(ast, (n) => {
    if (!hay && esLlamadaDistribucion(n)) hay = true;
  });
  return hay;
}

/** ¿Contiene el AST alguna función de resultados (`RIESGO.MEDIA`, B6)? */
export function contieneFuncionResultado(ast: Nodo): boolean {
  let hay = false;
  recorrer(ast, (n) => {
    if (hay || n.tipo !== 'funcion') return;
    const id = idDeFuncionRiesgo(n.nombre);
    if (id !== null && esFuncionDeResultado(id)) hay = true;
  });
  return hay;
}

export function analizarRiesgoEnGrafo(grafo: Grafo, opciones: OpcionesRiesgoEnGrafo): RiesgoEnGrafo {
  const out: RiesgoEnGrafo = {
    entradas: [], claves: [], claveDeRef: new Map(), celdaDeEntrada: new Map(), descripciones: new Map(),
    conversiones: [], reescritas: [], reescrituras: new Map(), motivosReescritura: new Map(), noCompatibles: new Map(), errores: [], duplicadas: [],
    eventos: expandirEventos(grafo),
  };
  const deEvento = new Set(out.eventos);

  const candidatas: string[] = [];
  for (const [clave, nodo] of grafo.nodos) {
    if (nodo.ast && contieneDistribucion(nodo.ast)) candidatas.push(clave);
  }
  if (candidatas.length === 0) return out;

  const delPanel = new Set(opciones.clavesEntradaPanel);
  const aleatorias = clausuraDependientes(grafo, [...candidatas, ...opciones.clavesEntradaPanel]);
  const ambito = opciones.todas ? null : clausuraDependencias(grafo, opciones.clavesSalida, delPanel);
  const evaluacion = crearEvaluacion(grafo);

  for (const clave of candidatas) {
    if (ambito && !ambito.has(clave)) continue;
    if (delPanel.has(clave)) {
      out.duplicadas.push(clave);
      continue;
    }
    const nodo = grafo.nodos.get(clave);
    if (!nodo?.ast) continue;
    const nombre = opciones.nombrar?.(clave, nodo.hoja, nodo.col, nodo.fila) ?? clave;
    const lector = evaluacion.lector(nodo.hoja);
    const evaluar = evaluacion.evaluador(nodo.hoja);

    const argsAleatorios = [...(grafo.dependencias.get(clave) ?? [])].some((d) => aleatorias.has(d));
    if (esLlamadaDistribucion(nodo.ast) && !argsAleatorios && !argumentosConDistribucion(nodo.ast)) {
      // Caso 1: la celda entera es la distribución, con argumentos fijos.
      const r = leerNodoRiesgo(nodo.ast, lector, evaluar);
      if (!r.ok) {
        out.errores.push(`${clave}: ${r.motivo}`);
        continue;
      }
      const entrada: EntradaRiskModel = { id: `${PREFIJO_FUNCION}${clave}`, name: nombre, ref: clave, dist: r.spec, correlations: [] };
      agregar(out, entrada, clave, clave);
      out.conversiones.push({ clave, hoja: nodo.hoja, col: nodo.col, fila: nodo.fila, spec: r.spec, media: r.media });
      continue;
    }

    // Casos 2 y 3: se reescribe la fórmula.
    const llamadas = contarLlamadas(nodo.ast);
    let k = 0;
    let conParametros = false;
    let truncarConParametros = false;
    const errores: string[] = [];
    const nuevas: Array<{ entrada: EntradaRiskModel; claveVirtual: string; descripcion?: string }> = [];

    const transformar = (n: Nodo): Nodo => {
      if (esLlamadaDistribucion(n)) {
        k++;
        const ref = llamadas > 1 ? `${clave} (${k})` : clave;
        // En un riesgo del registro (T8), la primera es si ocurre y el resto, el impacto.
        const nombreK = deEvento.has(clave) ? `${nombre} (${k === 1 ? 'ocurre' : 'impacto'})` : llamadas > 1 ? `${nombre} (${k})` : nombre;
        const hojaVirtual = `\u0001${ref}`;
        const claveVirtual = `${hojaVirtual}!A1`;
        const celdaVirtual: Nodo = { tipo: 'celda', ref: { hoja: hojaVirtual, col: 1, fila: 1 }, pos: n.pos };
        const id = idDeFuncionRiesgo(n.nombre) as string;

        let aleatoria = argumentosConDistribucion(n);
        referenciasDe(n, nodo.hoja, (d) => {
          if (aleatorias.has(d)) aleatoria = true;
        });

        if (!aleatoria) {
          // Caso 2: argumentos fijos, dentro de una operación.
          const r = leerNodoRiesgo(n, lector, evaluar);
          if (!r.ok) {
            errores.push(r.motivo);
            return n;
          }
          if (r.spec.type === 'categorical') {
            errores.push(`RIESGO.${id} dentro de una operación todavía no se admite: ponla sola en una celda y usa esa celda`);
            return n;
          }
          nuevas.push({ entrada: { id: `${PREFIJO_FUNCION}${ref}`, name: nombreK, ref, dist: r.spec, correlations: [] }, claveVirtual });
          return celdaVirtual;
        }

        // Caso 3: parámetros que cambian en cada iteración.
        conParametros = true;
        let etiqueta: string;
        let args: Nodo[];
        if (esFuncionParametrica(id)) {
          etiqueta = id;
          args = n.args.map(transformar);
        } else if (id === FUNCION_TRUNCAR.id) {
          const [interior, a, b] = n.args;
          const idInterior = interior && interior.tipo === 'funcion' ? idDeFuncionRiesgo(interior.nombre) : null;
          if (!interior || interior.tipo !== 'funcion' || !idInterior || !esFuncionParametrica(idInterior) || !a || !b) {
            errores.push('RIESGO.TRUNCAR con parámetros que cambian en cada iteración necesita dentro una función como RIESGO.NORMAL');
            return n;
          }
          etiqueta = `${FUNCION_TRUNCAR.id}:${idInterior}`;
          truncarConParametros = true;
          args = [transformar(a), transformar(b), ...interior.args.map(transformar)];
        } else {
          errores.push(`RIESGO.${id} con valores que cambian en cada iteración todavía no se admite: sus rangos tienen que ser fijos`);
          return n;
        }
        const descripcion = `${nombreFuncion(etiqueta)} con parámetros que cambian en cada iteración`;
        nuevas.push({
          entrada: { id: `${PREFIJO_DINAMICA}${ref}`, name: nombreK, ref, dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] },
          claveVirtual,
          descripcion,
        });
        return {
          tipo: 'funcion',
          nombre: NOMBRE_CUANTIL,
          args: [celdaVirtual, { tipo: 'texto', valor: etiqueta, pos: n.pos }, ...args],
          pos: n.pos,
        };
      }
      return mapearHijos(n, transformar);
    };

    const nuevoAst = transformar(nodo.ast);
    if (errores.length > 0) {
      for (const e of errores) out.errores.push(`${clave}: ${e}`);
      continue;
    }
    for (const x of nuevas) {
      agregar(out, x.entrada, x.claveVirtual, clave);
      if (x.descripcion) out.descripciones.set(x.entrada.id, x.descripcion);
    }
    out.reescritas.push(clave);
    out.reescrituras.set(clave, nuevoAst);
    out.motivosReescritura.set(
      clave,
      conParametros ? 'tiene una función RIESGO con parámetros que cambian en cada iteración' : 'tiene una función RIESGO dentro de una operación',
    );
    // B1b: con Excel en el bucle, la función de la celda devuelve su sorteo.
    // Hace falta saber qué llamada es (una por celda) y poder devolver el
    // valor de la distribución entera (TRUNCAR solo ve el valor de dentro).
    if (llamadas > 1) {
      out.noCompatibles.set(clave, 'tiene varias funciones RIESGO en la misma fórmula; con Excel en el bucle, pon cada una en su celda');
    } else if (truncarConParametros) {
      out.noCompatibles.set(clave, 'tiene RIESGO.TRUNCAR con parámetros que cambian en cada iteración, que solo simula el motor rápido');
    }
  }
  return out;
}

/** Aplica al grafo las reescrituras de los casos 2 y 3. */
export function aplicarReescrituras(grafo: Grafo, r: Pick<RiesgoEnGrafo, 'reescrituras'>): void {
  for (const [clave, ast] of r.reescrituras) reemplazarAst(grafo, clave, ast);
}

function agregar(out: RiesgoEnGrafo, entrada: EntradaRiskModel, claveGrafo: string, celda: string): void {
  out.entradas.push(entrada);
  out.claves.push(claveGrafo);
  out.claveDeRef.set(entrada.ref, claveGrafo);
  out.celdaDeEntrada.set(entrada.id, celda);
}

function nombreFuncion(etiqueta: string): string {
  const [a, b] = etiqueta.split(':');
  return b ? `RIESGO.${b} acotada` : `RIESGO.${a}`;
}

/** Los argumentos de una llamada, con el interior de TRUNCAR abierto. */
function argumentosDe(x: Extract<Nodo, { tipo: 'funcion' }>): Nodo[] {
  const id = idDeFuncionRiesgo(x.nombre);
  return id === FUNCION_TRUNCAR.id && x.args[0]?.tipo === 'funcion' ? [...x.args.slice(1), ...x.args[0].args] : x.args;
}

/** ¿Lleva la llamada otra distribución en sus argumentos? (`RIESGO.NORMAL(RIESGO.NORMAL(10;1);2)`) */
function argumentosConDistribucion(x: Extract<Nodo, { tipo: 'funcion' }>): boolean {
  return argumentosDe(x).some(contieneDistribucion);
}

/** Cuántas llamadas «de fuera» hay (una TRUNCAR con su interior cuenta una). */
function contarLlamadas(ast: Nodo): number {
  let n = 0;
  const visitar = (x: Nodo): void => {
    if (esLlamadaDistribucion(x)) {
      n++;
      // Los argumentos de una llamada pueden contener otras (parámetros
      // aleatorios): cuentan, salvo el interior de TRUNCAR.
      for (const a of argumentosDe(x)) visitar(a);
      return;
    }
    mapearHijos(x, (h) => {
      visitar(h);
      return h;
    });
  };
  visitar(ast);
  return n;
}

function mapearHijos(n: Nodo, f: (h: Nodo) => Nodo): Nodo {
  switch (n.tipo) {
    case 'funcion':
      return { ...n, args: n.args.map(f) };
    case 'unaria':
    case 'porcentaje':
      return { ...n, arg: f(n.arg) };
    case 'binaria':
      return { ...n, izq: f(n.izq), der: f(n.der) };
    case 'matriz':
      return { ...n, filas: n.filas.map((fila) => fila.map(f)) };
    default:
      return n;
  }
}

/**
 * Calcula, con el motor y una sola iteración, celdas que no dependen de nada
 * aleatorio: los argumentos fijos de las funciones RIESGO. Guarda lo calculado
 * para no repetirlo entre llamadas.
 */
function crearEvaluacion(grafo: Grafo) {
  const valores = new Map<string, Columna>();
  const fallidas = new Set<string>();

  const calcular = (claves: readonly string[]): boolean => {
    // Una celda que no está en el grafo está vacía (vacío, que en un número es 0).
    for (const c of claves) if (!grafo.nodos.has(c) && !valores.has(c)) valores.set(c, vacioConstante(1));
    const pendientes = claves.filter((c) => !valores.has(c));
    if (pendientes.length === 0) return true;
    if (pendientes.some((c) => fallidas.has(c))) return false;
    const necesarias = clausuraDependencias(grafo, pendientes);
    const { orden, enCiclo } = ordenarTopologicamente(grafo, necesarias);
    for (const clave of orden) {
      if (valores.has(clave)) continue;
      if (enCiclo.has(clave) || fallidas.has(clave)) {
        fallidas.add(clave);
        continue;
      }
      const nodo = grafo.nodos.get(clave);
      if (!nodo) {
        valores.set(clave, vacioConstante(1));
        continue;
      }
      if (nodo.errorParseo) {
        fallidas.add(clave);
        continue;
      }
      if (!nodo.ast) {
        valores.set(clave, nodo.valor === undefined ? vacioConstante(1) : desdeEscalar(nodo.valor, 1));
        continue;
      }
      const r = evaluarNodo(nodo.ast, nodo.hoja, valores, 1);
      if (r.ok) valores.set(clave, r.columna);
      else fallidas.add(clave);
    }
    return pendientes.every((c) => valores.has(c));
  };

  return {
    evaluador(hoja: string): EvaluadorDeArgumento {
      return (nodo) => {
        const refs: string[] = [];
        referenciasDe(nodo, hoja, (c) => refs.push(c));
        if (!calcular(refs)) return null;
        const r = evaluarNodo(nodo, hoja, valores, 1);
        if (!r.ok) return null;
        const v = coercionNumerica(r.columna, 0);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      };
    },
    lector(hoja: string): LectorDeRango {
      return (nodo) => {
        // Por filas, como se leen en la hoja: el orden de valores y pesos importa.
        const refs: string[] = [];
        if (nodo.tipo === 'celda') {
          refs.push(claveCelda(nodo.ref.hoja ?? hoja, nodo.ref.col, nodo.ref.fila));
        } else {
          const { col1, fila1, col2, fila2 } = nodo.ref;
          if (col1 === null || fila1 === null || col2 === null || fila2 === null) return null;
          if ((Math.abs(col2 - col1) + 1) * (Math.abs(fila2 - fila1) + 1) > LIMITE_CELDAS_RANGO) return null;
          const h = nodo.ref.hoja ?? hoja;
          for (let f = Math.min(fila1, fila2); f <= Math.max(fila1, fila2); f++) {
            for (let c = Math.min(col1, col2); c <= Math.max(col1, col2); c++) refs.push(claveCelda(h, c, f));
          }
        }
        if (!calcular(refs)) return null;
        return refs.map((c) => {
          const v = valorEn(valores.get(c) as Columna, 0);
          if (v.tipo === NUMERO) return v.numero;
          if (v.tipo === TEXTO) return v.texto;
          if (v.tipo === LOGICO) return v.numero !== 0;
          return null;
        });
      };
    },
  };
}
