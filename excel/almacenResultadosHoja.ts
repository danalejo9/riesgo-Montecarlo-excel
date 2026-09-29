/**
 * El almacén que comparten el panel y las funciones de Excel (B6): el panel
 * escribe ahí los resultados al simular y las funciones `RIESGO.MEDIA`… los
 * leen. Ver `resultadosEnHoja.ts` para el porqué y los límites.
 *
 * Se usa `OfficeRuntime.storage`, el almacén que Office da a los dos procesos
 * del complemento sin runtime compartido. Donde no existe (el banco de
 * pruebas, un navegador suelto) se usa `localStorage`, que en Excel para la
 * Web comparten los dos porque son del mismo origen.
 */

import { leerLibro } from './lectorLibro.ts';
import { rangoDesdeDireccion } from './rangos.ts';
import { componerDireccion } from './direcciones.ts';
import { contieneFuncionResultado } from '../engine/modelo/index.ts';
import { letrasDeColumna } from '../engine/parser/ast.ts';
import { construirGrafo } from '../engine/graph/index.ts';
import type { SimulacionCompletada } from './informe.ts';
import {
  almacenEnMemoria,
  CLAVE_ALMACEN_RESULTADOS,
  construirAlmacen,
  direccionSinLibro,
  leerAlmacen,
  normalizarDireccion,
  ponerAlmacenEnMemoria,
  tomarCeldasPendientes,
  type AlmacenResultadosHoja,
} from './resultadosEnHoja.ts';

interface AlmacenOffice {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
}

function almacenOffice(): AlmacenOffice | null {
  const g = globalThis as unknown as { OfficeRuntime?: { storage?: AlmacenOffice } };
  return g.OfficeRuntime?.storage ?? null;
}

export async function leerTextoAlmacen(): Promise<string | null> {
  const o = almacenOffice();
  if (o) {
    try {
      return await o.getItem(CLAVE_ALMACEN_RESULTADOS);
    } catch {
      // sigue con localStorage
    }
  }
  try {
    return globalThis.localStorage?.getItem(CLAVE_ALMACEN_RESULTADOS) ?? null;
  } catch {
    return null;
  }
}

async function escribirTexto(texto: string): Promise<void> {
  const o = almacenOffice();
  if (o) {
    try {
      await o.setItem(CLAVE_ALMACEN_RESULTADOS, texto);
    } catch {
      // sigue con localStorage
    }
  }
  try {
    globalThis.localStorage?.setItem(CLAVE_ALMACEN_RESULTADOS, texto);
  } catch {
    // Sin almacén: las funciones dirán «simula primero». No rompe nada.
  }
}

export async function leerAlmacenPublicado(): Promise<AlmacenResultadosHoja | null> {
  return leerAlmacen(await leerTextoAlmacen());
}

/**
 * Publica los resultados para las funciones. Se **mezcla** con lo que ya
 * hubiera: las salidas de otro libro siguen ahí; las de este se sustituyen.
 */
export async function publicarResultados(resultado: SimulacionCompletada): Promise<void> {
  const nuevo = construirAlmacen(resultado);
  const previo = almacenEnMemoria() ?? (await leerAlmacenPublicado());
  const salidas = { ...(previo?.salidas ?? {}), ...nuevo.salidas };
  const mezcla = { ...nuevo, salidas };
  // B1: en memoria para las funciones (mismo proceso), y en el almacén para
  // cualquier proceso aparte que quede (Excel sin runtime compartido).
  ponerAlmacenEnMemoria(mezcla);
  await escribirTexto(JSON.stringify(mezcla));
}

/**
 * Las celdas que hay que volver a calcular tras publicar: las que usan
 * funciones de resultados en el modelo simulado y las que dijeron «simula
 * primero» mientras no había resultados (B1).
 */
export function celdasParaRefrescar(conResultados: readonly string[] = []): string[] {
  return [...new Set([...conResultados, ...tomarCeldasPendientes()])];
}

/**
 * Hace que Excel vuelva a calcular las celdas con funciones de resultados:
 * no dependen de nada que cambie, así que Excel no lo haría solo. Volver a
 * escribir su fórmula basta y no toca el resto del libro.
 */
export async function refrescarCeldas(direcciones: readonly string[]): Promise<void> {
  if (direcciones.length === 0) return;
  await Excel.run(async (context) => {
    const rangos = [...new Set(direcciones.map(direccionSinLibro))].map((d) => {
      const r = rangoDesdeDireccion(context, d);
      r.load('formulas');
      return r;
    });
    await context.sync();
    for (const r of rangos) {
      const f = r.formulas;
      r.formulas = f;
    }
    await context.sync();
  });
}

/**
 * Al abrir el panel con resultados guardados en el libro: se publican (en
 * memoria y en el almacén) y se refrescan las celdas con funciones de
 * resultados que ya hubieran dicho «simula primero» (B1: las apuntan ellas
 * mismas). Sin runtime compartido esa lista no llega aquí; entonces, si el
 * almacén no tenía estas salidas, se buscan en el libro.
 */
export async function publicarRestaurados(resultado: SimulacionCompletada): Promise<void> {
  const previo = almacenEnMemoria() ?? (await leerAlmacenPublicado());
  const faltaban = resultado.salidas.some((s) => !previo?.salidas[normalizarDireccion(s.clave ?? s.ref)]);
  await publicarResultados(resultado);
  const pendientes = celdasParaRefrescar();
  if (pendientes.length > 0 || !faltaban || compartido()) {
    await refrescarCeldas(pendientes);
    return;
  }
  const libro = await leerLibro();
  if (!libro.formulas.some((f) => /\bRIESGO\.(MEDIA|DESV|PERCENTIL|PROB|MIN|MAX)\s*\(/i.test(f.formula))) return;
  const { grafo } = construirGrafo(libro.formulas);
  const celdas: string[] = [];
  for (const nodo of grafo.nodos.values()) {
    if (nodo.ast && contieneFuncionResultado(nodo.ast)) celdas.push(componerDireccion(nodo.hoja, `${letrasDeColumna(nodo.col)}${nodo.fila}`));
  }
  await refrescarCeldas(celdas);
}

/** ¿Corre el complemento con runtime compartido? */
function compartido(): boolean {
  try {
    return typeof Office !== 'undefined' && Office.context?.requirements?.isSetSupported?.('SharedRuntime', '1.1') === true;
  } catch {
    return false;
  }
}
