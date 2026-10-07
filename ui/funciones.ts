/**
 * Las funciones `RIESGO.*` de Excel (funciones personalizadas).
 *
 * Fuera de la simulación, cada una devuelve lo que diga el **modo del libro**
 * (B2, `engine/modelo/valorFijo.ts`): en «Valores fijos» (por defecto) un
 * estadístico de su distribución —la media, salvo que se elija la mediana,
 * la moda o un percentil—; en «Aleatorio», un valor al azar que cambia con
 * F9 (por eso son volátiles). Durante la simulación el complemento no usa lo
 * que devuelven: sus muestras las pone el motor (`excel/entradasRiesgo.ts`).
 *
 * Las funciones de resultados (B6: `RIESGO.MEDIA(C32)`…) leen lo que el
 * panel publicó al simular (`excel/resultadosEnHoja.ts`). Excel les pasa la
 * dirección de la celda (`requiresParameterAddresses`) además de su valor.
 *
 * Este archivo se empaqueta aparte, en un solo archivo sin módulos
 * (`vite.funciones.config.ts`): el motor de funciones personalizadas de Excel
 * en Windows no es un navegador y no sabe importar.
 */

import {
  categoriaDesdeListas, discretaDesdeListas, empiricaDesdeLista, FUNCION_CATEGORIA, FUNCION_DISCRETA, FUNCION_EMPIRICA, FUNCION_HISTOGRAMA, FUNCION_TRUNCAR,
  histogramaDesdeLista,
  construirSpecRiesgo, FUNCION_CORRELACION, FUNCION_CRONOGRAMA, FUNCION_DECISION, FUNCION_EVENTO, FUNCION_SALIDA, FUNCIONES_RESULTADO, FUNCIONES_RIESGO,
} from '../engine/modelo/funcionesRiesgo.ts';
import { valorDelPlan } from '../engine/cronograma/planPublicado.ts';
import { leerPlanCronograma } from '../excel/planCronograma.ts';
import { valorAleatorio, valorEnModo } from '../engine/modelo/valorFijo.ts';
import type { DistributionSpec } from '../engine/modelo/distributionSchema.ts';
import { modoLibroEnMemoria, simulacionEnExcel } from '../excel/modoLibroCompartido.ts';
import {
  almacenEnMemoria, anotarCeldaPendiente, buscarSalida, CLAVE_ALMACEN_RESULTADOS, leerAlmacen, normalizarDireccion, valorFuncionResultado,
  type AlmacenResultadosHoja,
} from '../excel/resultadosEnHoja.ts';

declare const CustomFunctions: {
  associate(id: string, f: (...args: never[]) => number | string | Promise<number>): void;
  Error: new (codigo: unknown, mensaje?: string) => Error;
  ErrorCode: { invalidNumber: unknown; invalidName: unknown; invalidValue: unknown; notAvailable: unknown };
};

// B1: este archivo se carga también en el panel (runtime compartido) y en el
// banco de pruebas, donde `CustomFunctions` no existe: ahí no se registra nada.
const asociar: typeof CustomFunctions.associate = (id, f) => {
  if (typeof CustomFunctions !== 'undefined') CustomFunctions.associate(id, f);
};

/** La invocación que Excel pasa al final (`requiresAddress`): la celda de la función. */
function celdaDe(args: readonly unknown[]): string | undefined {
  const ultimo = args[args.length - 1] as { address?: unknown } | undefined;
  return ultimo && typeof ultimo === 'object' && typeof ultimo.address === 'string' ? ultimo.address : undefined;
}

/**
 * B1b: en una simulación con Excel en el bucle, lo que toca en esta celda en
 * esta iteración (o nada, si la celda no sortea por su función).
 */
function sorteoEnCurso(spec: DistributionSpec | string, celda: string | undefined): number | string | undefined {
  const sim = simulacionEnExcel();
  if (!sim || !celda) return undefined;
  const s = sim.porCelda.get(normalizarDireccion(celda));
  if (!s) return undefined;
  const x = s.muestras[sim.iteracion] as number;
  if (s.tipo === 'muestra') return s.categorias ? (s.categorias[Math.round(x)] ?? '') : x;
  // Un uniforme: el cuantil con los parámetros de esta iteración.
  if (typeof spec === 'string') throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, spec);
  return valorAleatorio(spec, x);
}

/** El valor de la celda en el modo del libro, o el error de Excel si la distribución no vale. */
function enModo(spec: DistributionSpec | string, nombre: string, celda?: string): number | string {
  const sorteo = sorteoEnCurso(spec, celda);
  if (sorteo !== undefined) return sorteo;
  if (typeof spec === 'string') throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, spec);
  try {
    return valorEnModo(spec, modoLibroEnMemoria());
  } catch {
    throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, `Parámetros no válidos para RIESGO.${nombre}`);
  }
}

for (const f of FUNCIONES_RIESGO) {
  asociar(f.id, (...args: number[]) => enModo(construirSpecRiesgo(f.id, args.slice(0, f.parametros.length)), f.id, celdaDe(args)));
}

// T4: el valor más probable de una entrada de texto. Los argumentos llegan
// como matrices (rango o lista), se aplanan en el mismo orden.
asociar(FUNCION_CATEGORIA.id, (valores: unknown[][], pesos: unknown[][], invocacion?: unknown) => {
  const r = categoriaDesdeListas(valores.flat(), pesos.flat());
  return enModo(typeof r === 'string' ? r : r.spec, FUNCION_CATEGORIA.id, celdaDe([invocacion]));
});

// B4: la media de una discreta, y una función RIESGO acotada.
asociar(FUNCION_DISCRETA.id, (valores: unknown[][], pesos: unknown[][], invocacion?: unknown) => {
  const r = discretaDesdeListas(valores.flat(), pesos.flat());
  return enModo(typeof r === 'string' ? r : r.spec, FUNCION_DISCRETA.id, celdaDe([invocacion]));
});

asociar(FUNCION_TRUNCAR.id, (valor: number, minimo: number, maximo: number) => {
  // Fuera de la simulación la función interior ya enseña su valor (fijo o al
  // azar); aquí solo se mantiene dentro de los límites. La simulación usa la
  // distribución acotada de verdad. (En «Aleatorio», lo que cae fuera se
  // queda en el límite: basta para explorar el modelo, no para medirlo.)
  if (!(minimo < maximo)) throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, 'RIESGO.TRUNCAR: el mínimo tiene que ser menor que el máximo');
  return Math.min(maximo, Math.max(minimo, valor));
});

// B5: un histograma de forma libre.
asociar(FUNCION_HISTOGRAMA.id, (minimo: number, maximo: number, pesos: unknown[][], invocacion?: unknown) => {
  const r = histogramaDesdeLista(minimo, maximo, pesos.flat());
  return enModo(typeof r === 'string' ? r : r.spec, FUNCION_HISTOGRAMA.id, celdaDe([invocacion]));
});

// I1: la media de los datos históricos.
asociar(FUNCION_EMPIRICA.id, (datos: unknown[][], invocacion?: unknown) => {
  const r = empiricaDesdeLista(datos.flat());
  return enModo(typeof r === 'string' ? r : r.spec, FUNCION_EMPIRICA.id, celdaDe([invocacion]));
});

// B6: los resultados de la última simulación. El almacén se relee en cada
// llamada (el panel lo cambia al simular), pero solo se vuelve a interpretar
// si su texto cambió.
let ultimoTexto: string | null = null;
let ultimoAlmacen: AlmacenResultadosHoja | null = null;

async function almacen(): Promise<AlmacenResultadosHoja | null> {
  // Con el runtime compartido, lo que el panel tiene en memoria (B1).
  const enMemoria = almacenEnMemoria();
  if (enMemoria) return enMemoria;
  const g = globalThis as unknown as { OfficeRuntime?: { storage?: { getItem(c: string): Promise<string | null> } } };
  let texto: string | null;
  try {
    texto = g.OfficeRuntime?.storage ? await g.OfficeRuntime.storage.getItem(CLAVE_ALMACEN_RESULTADOS) : null;
  } catch {
    texto = null;
  }
  if (texto === null) {
    try {
      texto = globalThis.localStorage?.getItem(CLAVE_ALMACEN_RESULTADOS) ?? null;
    } catch {
      texto = null;
    }
  }
  if (texto !== ultimoTexto) {
    ultimoTexto = texto;
    ultimoAlmacen = leerAlmacen(texto);
  }
  return ultimoAlmacen;
}

interface Invocacion {
  parameterAddresses?: string[];
  /** La celda de la propia función (`requiresAddress`). */
  address?: string;
}

for (const f of FUNCIONES_RESULTADO) {
  asociar(f.id, (async (...args: unknown[]) => {
    // Excel añade la invocación como último argumento.
    const invocacion = (args[args.length - 1] ?? {}) as Invocacion;
    const [valorCelda, ...resto] = args.slice(0, f.parametros.length);
    const direccion = invocacion.parameterAddresses?.[0];
    const salida = buscarSalida(await almacen(), direccion, valorCelda);
    const r = valorFuncionResultado(f.id, salida, resto);
    if (r.ok) return r.valor;
    // Sin resultados todavía: el panel refrescará esta celda cuando los tenga (B1).
    if (!salida) anotarCeldaPendiente(invocacion.address);
    const codigo = r.error === 'na' ? CustomFunctions.ErrorCode.notAvailable
      : r.error === 'num' ? CustomFunctions.ErrorCode.invalidNumber
      : CustomFunctions.ErrorCode.invalidValue;
    throw new CustomFunctions.Error(codigo, r.mensaje);
  }) as (...args: never[]) => Promise<number>);
}

// Resto de B6: declaran algo del modelo; en la hoja valen lo que el motor
// pone en su lugar al simular (0 la salida, el coeficiente la correlación).
asociar(FUNCION_SALIDA.id, (nombre?: unknown) => {
  if (nombre !== undefined && nombre !== null && typeof nombre !== 'string') {
    throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidValue, 'El nombre de RIESGO.SALIDA tiene que ser un texto');
  }
  return 0;
});

asociar(FUNCION_CORRELACION.id, (_a: unknown, _b: unknown, coeficiente: unknown) => {
  if (typeof coeficiente !== 'number' || !(coeficiente >= -1 && coeficiente <= 1)) {
    throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, 'El coeficiente de RIESGO.CORRELACION tiene que estar entre -1 y 1');
  }
  return coeficiente;
});

// T8: un riesgo del registro. Fuera de la simulación, en «Valores fijos» vale
// p × impacto (su valor esperado, si el modo es la media); en «Aleatorio», el
// impacto o 0. Con Excel en el bucle (una sola función en la celda), el sorteo
// de «ocurre» de esta iteración.
asociar(FUNCION_EVENTO.id, (probabilidad: number, impacto: number, invocacion?: unknown) => {
  if (!(probabilidad >= 0 && probabilidad <= 1)) {
    throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, 'La probabilidad de RIESGO.EVENTO tiene que estar entre 0 y 1');
  }
  const ocurre = enModo({ type: 'bernoulli', p: probabilidad }, FUNCION_EVENTO.id, celdaDe([invocacion]));
  return (ocurre as number) * impacto;
});

// T9: una decisión. En la hoja vale la primera opción; al simular, el panel
// compara todas. El parámetro se repite: cada argumento llega como una matriz.
asociar(FUNCION_DECISION.id, ((opciones: unknown[][][]) => {
  for (const matriz of opciones ?? []) {
    for (const fila of matriz ?? []) {
      for (const v of fila ?? []) {
        if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) return v;
      }
    }
  }
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidValue, 'RIESGO.DECISION necesita al menos una opción');
}) as (...args: never[]) => number | string);

// W5: el plazo del módulo Cronograma. Al simular, el motor pone en la celda el
// valor de cada iteración; fuera, el valor fijo si se da o el del plan que
// publicó el panel Cronograma al calcular.
asociar(FUNCION_CRONOGRAMA.id, (async (...args: unknown[]) => {
  const sorteo = sorteoEnCurso('RIESGO.CRONOGRAMA no sortea con parámetros', celdaDe(args));
  if (sorteo !== undefined) return sorteo;
  const [hito, medida, fijo] = args;
  if (typeof fijo === 'number') return fijo;
  const texto = (x: unknown) => (x === null || x === undefined || typeof x === 'object' ? '' : String(x));
  const plan = await leerPlanCronograma();
  const v = valorDelPlan(plan, texto(hito), texto(medida));
  if (typeof v === 'number') return v;
  // Sin plan todavía: el panel refrescará esta celda cuando lo tenga (al calcular o al abrir el libro).
  if (!plan) anotarCeldaPendiente(celdaDe(args));
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.notAvailable, v);
}) as (...args: never[]) => Promise<number>);

