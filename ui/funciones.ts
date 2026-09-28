/**
 * Las funciones `RIESGO.*` de Excel (funciones personalizadas).
 *
 * Fuera de la simulación, cada una devuelve **la media** de su distribución:
 * el libro sigue calculando con normalidad y la celda enseña su valor
 * esperado, que es lo que un modelo determinista habría puesto ahí. Durante la
 * simulación el complemento ni las llama: la celda es una entrada y su valor
 * lo pone el muestreo (`excel/entradasRiesgo.ts`).
 *
 * Este archivo se empaqueta aparte, en un solo archivo sin módulos
 * (`vite.funciones.config.ts`): el motor de funciones personalizadas de Excel
 * en Windows no es un navegador y no sabe importar.
 */

import {
  categoriaDesdeListas, discretaDesdeListas, FUNCION_CATEGORIA, FUNCION_DISCRETA, FUNCION_TRUNCAR, FUNCIONES_RIESGO, mediaDeFuncionRiesgo,
} from '../engine/modelo/funcionesRiesgo.ts';

declare const CustomFunctions: {
  associate(id: string, f: (...args: never[]) => number | string): void;
  Error: new (codigo: unknown, mensaje?: string) => Error;
  ErrorCode: { invalidNumber: unknown; invalidName: unknown };
};

for (const f of FUNCIONES_RIESGO) {
  CustomFunctions.associate(f.id, (...args: number[]) => {
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
CustomFunctions.associate(FUNCION_CATEGORIA.id, (valores: unknown[][], pesos: unknown[][]) => {
  const r = categoriaDesdeListas(valores.flat(), pesos.flat());
  if (typeof r !== 'string') return r.masProbable;
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, r);
});

// B4: la media de una discreta, y una función RIESGO acotada.
CustomFunctions.associate(FUNCION_DISCRETA.id, (valores: unknown[][], pesos: unknown[][]) => {
  const r = discretaDesdeListas(valores.flat(), pesos.flat());
  if (typeof r !== 'string') return r.media;
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, r);
});

CustomFunctions.associate(FUNCION_TRUNCAR.id, (valor: number, minimo: number, maximo: number) => {
  // Fuera de la simulación la función interior ya enseña su media; aquí solo
  // se mantiene dentro de los límites. La simulación usa la distribución
  // acotada de verdad.
  if (!(minimo < maximo)) throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidNumber, 'RIESGO.TRUNCAR: el mínimo tiene que ser menor que el máximo');
  return Math.min(maximo, Math.max(minimo, valor));
});
