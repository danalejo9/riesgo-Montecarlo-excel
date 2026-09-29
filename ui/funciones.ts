/**
 * Las funciones `RIESGO.*` de Excel (funciones personalizadas).
 *
 * Fuera de la simulación, cada una devuelve **la media** de su distribución:
 * el libro sigue calculando con normalidad y la celda enseña su valor
 * esperado, que es lo que un modelo determinista habría puesto ahí. Durante la
 * simulación el complemento ni las llama: la celda es una entrada y su valor
 * lo pone el muestreo (`excel/entradasRiesgo.ts`).
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
  categoriaDesdeListas, discretaDesdeListas, empiricaDesdeLista, FUNCION_CATEGORIA, FUNCION_DISCRETA, FUNCION_EMPIRICA, FUNCION_TRUNCAR,
  FUNCIONES_RESULTADO, FUNCIONES_RIESGO, mediaDeFuncionRiesgo,
} from '../engine/modelo/funcionesRiesgo.ts';
import {
  almacenEnMemoria, anotarCeldaPendiente, buscarSalida, CLAVE_ALMACEN_RESULTADOS, leerAlmacen, valorFuncionResultado,
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

for (const f of FUNCIONES_RIESGO) {
  asociar(f.id, (...args: number[]) => {
    const r = mediaDeFuncionRiesgo(f.id, args.slice(0, f.parametros.length));
    if (typeof r === 'number') return r;
    throw new CustomFunctions.Error(
      r === '#NAME?' ? CustomFunctions.ErrorCode.invalidName : CustomFunctions.ErrorCode.invalidNumber,
      `Parámetros no válidos para RIESGO.${f.id}`,
    );
  });
}

// T4: el valor más probable de una entrada de texto. Los argumentos llegan
// como matrices (rango o lista), se aplanan en el mismo orden.
asociar(FUNCION_CATEGORIA.id, (valores: unknown[][], pesos: unknown[][]) => {
  const r = categoriaDesdeListas(valores.flat(), pesos.flat());
  if (typeof r !== 'string') return r.masProbable;
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, r);
});

// B4: la media de una discreta, y una función RIESGO acotada.
asociar(FUNCION_DISCRETA.id, (valores: unknown[][], pesos: unknown[][]) => {
  const r = discretaDesdeListas(valores.flat(), pesos.flat());
  if (typeof r !== 'string') return r.media;
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, r);
});

asociar(FUNCION_TRUNCAR.id, (valor: number, minimo: number, maximo: number) => {
  // Fuera de la simulación la función interior ya enseña su media; aquí solo
  // se mantiene dentro de los límites. La simulación usa la distribución
  // acotada de verdad.
  if (!(minimo < maximo)) throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, 'RIESGO.TRUNCAR: el mínimo tiene que ser menor que el máximo');
  return Math.min(maximo, Math.max(minimo, valor));
});

// I1: la media de los datos históricos.
asociar(FUNCION_EMPIRICA.id, (datos: unknown[][]) => {
  const r = empiricaDesdeLista(datos.flat());
  if (typeof r !== 'string') return r.media;
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, r);
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
