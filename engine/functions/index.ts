export {
  contarNoVacios,
  recorrerNumeros,
  vectoresNumericos,
  REGLAS_CALCULO,
  REGLAS_CONTEO,
  type ReglasAgregacion,
} from './agregacion.ts';
export { aplanar, argRango, argValor, type Argumento, type FuncionExcel } from './types.ts';
export * from './math.ts';
export * from './logic.ts';
export * from './info.ts';
export * from './condicionales.ts';
export * from './fechas.ts';
export * from './financieras.ts';
export * from './busquedas.ts';
export { mapaNumerico, nAriaNumerica, zipNumerico, type Resultado } from './elemental.ts';
export {
  compilarCriterio, compilarCriterioTexto, cumple, type Comparador, type Criterio,
} from './criterios.ts';
export { funcionSoportada, obtenerFuncion, REGISTRO } from './registry.ts';
