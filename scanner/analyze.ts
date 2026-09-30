/**
 * Convierte un libro leído en el informe de compatibilidad.
 *
 * Responde a tres preguntas, en este orden de importancia:
 *   1. ¿Qué porcentaje de las fórmulas podría evaluar el motor rápido?
 *   2. Si no todas, ¿qué funciones concretas lo impiden y cuántas veces salen?
 *   3. ¿De qué tamaño es el problema? (para dimensionar el motor, D11)
 */

import { funcionSoportada } from '../engine/functions/registry.ts';
import {
  clasificar,
  esFuncionPropia,
  esVolatil,
  normalizar,
  type Nivel,
} from './catalog.ts';
import { leerFormula, partirCelda } from './formula.ts';
import { indiceAColumna, type LibroLeido } from './xlsx.ts';

/** Máximo de celdas que se expanden de un rango al construir el grafo. */
const LIMITE_EXPANSION_RANGO = 4096;

export interface UsoFuncion {
  nombre: string;
  nivel: Nivel;
  veces: number;
  ejemplo: string;
  /** Es una funcion del propio complemento (`RISK.*`): declara una entrada. */
  propia: boolean;
  /**
   * Si el motor la sabe evaluar **hoy**, consultado al registro de verdad.
   *
   * No es lo mismo que estar en el catálogo: el catálogo es el plan (§4.2 de
   * Fase 2) y el registro es la implementación. Confundirlos hace que el
   * informe prometa velocidad sobre un libro que el motor no puede correr.
   */
  implementada: boolean;
}

export interface Informe {
  archivo: string;
  hojas: number;
  celdasConContenido: number;
  formulas: number;
  formulasCompartidas: number;
  formulasMatriciales: number;

  /** Reparto de fórmulas según el nivel más exigente que contienen. */
  formulasPorNivel: Record<Nivel | 'propia', number>;
  /** % de fórmulas evaluables solo con Nivel 0. */
  coberturaN0: number;
  /** % de fórmulas evaluables con Nivel 0 + Nivel 1. Es la cifra que decide. */
  coberturaN0N1: number;

  funciones: UsoFuncion[];
  /** Fuera del catálogo previsto: no correrán sin cambiar el roadmap. */
  bloqueantes: UsoFuncion[];
  /** Dentro del catálogo pero aún sin implementar: correrán cuando se hagan. */
  pendientes: UsoFuncion[];

  /** Dónde están las fórmulas matriciales, para poder nombrarlas en el informe. */
  celdasMatriciales: string[];

  celdasVolatiles: number;
  referenciasExternas: number;
  derrames: number;
  nombresDefinidos: number;
  tablas: number;
  tieneVba: boolean;
  tienePowerQuery: boolean;
  enlacesExternos: number;

  /** Cota inferior de la cadena de dependencias más larga entre fórmulas. */
  profundidad: number;
  referenciasPorFormula: number;
  rangosDemasiadoAnchos: number;
  avisos: string[];
}

export function analizar(archivo: string, libro: LibroLeido): Informe {
  const usos = new Map<string, UsoFuncion>();
  const formulasPorNivel: Record<Nivel | 'propia', number> = {
    n0: 0, n1: 0, n2: 0, 'no-soportada': 0, desconocida: 0, propia: 0,
  };

  let celdasVolatiles = 0;
  let referenciasExternas = 0;
  let derrames = 0;
  let totalReferencias = 0;
  let rangosDemasiadoAnchos = 0;

  const indicePorCelda = new Map<string, number>();
  libro.formulas.forEach((f, i) => indicePorCelda.set(`${f.hoja}!${f.ref}`, i));
  const dependencias: number[][] = libro.formulas.map(() => []);

  // F1: `PR_P(…)` con `PR_P` un nombre del libro es una LAMBDA con nombre, y
  // `_xlpm.f(…)` una LAMBDA guardada en un LET: las resuelve el parser.
  const definidos = new Set(libro.nombresDefinidos.map((n) => n.toUpperCase()));
  const esLambdaConNombre = (bruto: string) => /^_xlpm\./i.test(bruto) || definidos.has(bruto.toUpperCase());

  libro.formulas.forEach((celda, i) => {
    const lectura = leerFormula(celda.formula);
    const origen = `${celda.hoja}!${celda.ref}`;

    // --- Funciones ---
    let peor: Nivel | 'propia' = 'n0';
    let volatil = false;

    for (const bruto of lectura.funciones) {
      if (esLambdaConNombre(bruto)) continue;
      const nombre = normalizar(bruto);
      const propia = esFuncionPropia(nombre);
      const nivel = propia ? 'n0' : clasificar(nombre);

      const previo = usos.get(nombre);
      if (previo) previo.veces++;
      else {
        usos.set(nombre, {
          nombre,
          nivel: propia ? 'n0' : nivel,
          veces: 1,
          ejemplo: origen,
          propia,
          // Una función propia (`RISK.*`) declara una entrada; no la evalúa el
          // registro, así que no tiene sentido preguntarle si la implementa.
          implementada: propia || funcionSoportada(nombre),
        });
      }

      if (esVolatil(nombre)) volatil = true;
      // El nivel del catálogo dice **qué clase de función es**; lo que decide
      // si una fórmula bloquea es si el motor sabe evaluarla. Una función de
      // Nivel 2 ya implementada cuenta como cubierta, igual que una de Nivel
      // 1: si no, el escáner seguiría llamando bloqueante a `IZQUIERDA` el día
      // después de implementarla, que es la clase de mentira optimista al
      // revés que este archivo existe para evitar.
      const efectivo = nivel === 'n2' && funcionSoportada(nombre) ? 'n1' : nivel;
      peor = peorNivel(peor, propia ? 'propia' : efectivo);
    }

    if (lectura.funciones.length === 0) peor = 'n0';
    if (volatil) celdasVolatiles++;
    if (lectura.referenciaExterna) referenciasExternas++;
    if (lectura.derrame) derrames++;
    formulasPorNivel[peor]++;

    // --- Dependencias, para estimar la profundidad del grafo ---
    const vecinos = dependencias[i] as number[];

    for (const ref of lectura.celdas) {
      totalReferencias++;
      const destino = indicePorCelda.get(`${ref.hoja ?? celda.hoja}!${ref.celda}`);
      if (destino !== undefined && destino !== i) vecinos.push(destino);
    }

    for (const rango of lectura.rangos) {
      totalReferencias++;
      const hoja = rango.hoja ?? celda.hoja;
      const a = partirCelda(rango.desde);
      const b = partirCelda(rango.hasta);
      if (!a || !b) continue;

      const filas = Math.abs(b.fila - a.fila) + 1;
      const cols = Math.abs(b.col - a.col) + 1;
      if (filas * cols > LIMITE_EXPANSION_RANGO) {
        // Un rango enorme (una columna entera, por ejemplo) no se expande: el
        // coste sería cuadrático y la profundidad que aporta es la misma.
        rangosDemasiadoAnchos++;
        continue;
      }

      for (let f = Math.min(a.fila, b.fila); f <= Math.max(a.fila, b.fila); f++) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
          const destino = indicePorCelda.get(`${hoja}!${indiceAColumna(c)}${f}`);
          if (destino !== undefined && destino !== i) vecinos.push(destino);
        }
      }
    }
  });

  const total = libro.formulas.length;
  const cubiertasN0 = formulasPorNivel.n0 + formulasPorNivel.propia;
  const cubiertasN0N1 = cubiertasN0 + formulasPorNivel.n1;

  const funciones = [...usos.values()].sort(
    (a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre),
  );

  return {
    archivo,
    hojas: libro.hojas.length,
    celdasConContenido: libro.celdasConContenido,
    formulas: total,
    formulasCompartidas: libro.formulas.filter((f) => f.compartida).length,
    formulasMatriciales: libro.formulas.filter((f) => f.matricial).length,
    celdasMatriciales: libro.formulas
      .filter((f) => f.matricial)
      .slice(0, 25)
      .map((f) => `${f.hoja}!${f.ref}`),
    formulasPorNivel,
    coberturaN0: porcentaje(cubiertasN0, total),
    coberturaN0N1: porcentaje(cubiertasN0N1, total),
    funciones,
    bloqueantes: funciones.filter(
      (f) => !f.implementada && (f.nivel === 'n2' || f.nivel === 'no-soportada' || f.nivel === 'desconocida'),
    ),
    // Previstas por el catálogo pero todavía sin implementar: el libro correrá
    // en el motor rápido en cuanto existan, pero hoy no.
    pendientes: funciones.filter(
      (f) => !f.implementada && (f.nivel === 'n0' || f.nivel === 'n1'),
    ),
    celdasVolatiles,
    referenciasExternas,
    derrames,
    nombresDefinidos: libro.nombresDefinidos.length,
    tablas: libro.tablas,
    tieneVba: libro.tieneVba,
    tienePowerQuery: libro.tienePowerQuery,
    enlacesExternos: libro.enlacesExternos,
    profundidad: profundidadMaxima(dependencias),
    referenciasPorFormula: total === 0 ? 0 : redondear(totalReferencias / total, 1),
    rangosDemasiadoAnchos,
    avisos: libro.avisos,
  };
}

const ORDEN: Record<Nivel | 'propia', number> = {
  n0: 0, propia: 1, n1: 2, n2: 3, desconocida: 4, 'no-soportada': 5,
};

function peorNivel(a: Nivel | 'propia', b: Nivel | 'propia'): Nivel | 'propia' {
  return ORDEN[b] > ORDEN[a] ? b : a;
}

/**
 * Cadena de dependencias más larga, con memoización y guardia de ciclos.
 *
 * Es una **cota inferior**: las fórmulas compartidas no aportan aristas (su
 * texto no viene ajustado en el XML) y los rangos muy anchos no se expanden.
 * Sirve para dimensionar, no como medida exacta.
 */
function profundidadMaxima(dependencias: number[][]): number {
  const n = dependencias.length;
  const memo = new Int32Array(n);
  // 0 = sin visitar, 1 = en la pila, 2 = resuelto
  const estado = new Uint8Array(n);
  let maximo = 0;

  // Recorrido en profundidad iterativo, no recursivo: una cadena de fórmulas
  // encadenadas de 20.000 celdas desbordaría la pila de llamadas de Node, y en
  // un libro de presupuesto encadenar miles de filas es de lo más normal.
  const pila: number[] = [];
  const siguiente: number[] = [];

  for (let raiz = 0; raiz < n; raiz++) {
    if (estado[raiz] === 2) continue;

    pila.push(raiz);
    siguiente.push(0);
    estado[raiz] = 1;

    while (pila.length > 0) {
      const nodo = pila[pila.length - 1] as number;
      const vecinos = dependencias[nodo] as number[];
      const k = siguiente[siguiente.length - 1] as number;

      if (k < vecinos.length) {
        siguiente[siguiente.length - 1] = k + 1;
        const v = vecinos[k] as number;
        if (estado[v] === 0) {
          estado[v] = 1;
          pila.push(v);
          siguiente.push(0);
        }
        // Si estado[v] === 1 hay una referencia circular: se ignora esa arista
        // en lugar de entrar en bucle. Excel las permite con cálculo iterativo.
        continue;
      }

      let mejor = 0;
      for (const v of vecinos) {
        const d = estado[v] === 2 ? (memo[v] as number) : 0;
        if (d + 1 > mejor) mejor = d + 1;
      }
      memo[nodo] = mejor;
      estado[nodo] = 2;
      if (mejor > maximo) maximo = mejor;

      pila.pop();
      siguiente.pop();
    }
  }

  return maximo;
}

function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : redondear((parte / total) * 100, 1);
}

function redondear(x: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}
