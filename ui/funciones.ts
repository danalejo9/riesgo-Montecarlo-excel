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

import { FUNCIONES_RIESGO, mediaDeFuncionRiesgo } from '../engine/modelo/funcionesRiesgo.ts';

declare const CustomFunctions: {
  associate(id: string, f: (...args: number[]) => number): void;
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
