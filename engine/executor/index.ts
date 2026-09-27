export { particionarEnBloques, tamanoBloqueAdaptativo, type Bloque } from './bloques.ts';
export { calcularBloque, type ResultadoCalculoBloque } from './calcularBloque.ts';
export { crearEjecutorSecuencial } from './ejecutorSecuencial.ts';
export {
  generarTramoDeEntrada,
  resolverEntradas,
  type DefinicionEntrada,
  type EntradaBuffer,
  type EntradaDistribucion,
} from './entradas.ts';
export { simularPorBloques, type OpcionesSimulacion, type ResultadoSimulacion, type SalidaSimulada } from './simular.ts';
export { ErrorCalculoBloque, type EjecutorDeBloques, type ParcialSalida, type ResultadoBloque, type Trabajo } from './tipos.ts';
export {
  compensanHilos,
  crearAtendedor,
  crearPool,
  TRABAJO_MINIMO_PARA_HILOS,
  type CanalHilo,
  type ContextoHilo,
  type MensajeAlHilo,
  type MensajeDelHilo,
  type Pool,
} from './pool.ts';
