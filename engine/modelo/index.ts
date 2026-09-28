export {
  CATALOGO_DISTRIBUCIONES,
  describirDistribucion,
  resumirDistribucion,
  type DescripcionDistribucion,
  type ParametroDistribucion,
  type TipoDistribucion,
} from './catalogoDistribuciones.ts';
export { agruparCorrelaciones, type GrupoCorrelacionado, type ResultadoAgrupacion } from './correlaciones.ts';
export {
  fromDescriptor,
  categoriasDe,
  MAXIMO_CATEGORIAS,
  problemaDeDistribucion,
  toDescriptor,
  type DistributionSpec,
  type LognormalParametrization,
} from './distributionSchema.ts';
export { describirMotivo, elegirMotor, type EleccionMotor, type MotivoIncompatible } from './eleccionMotor.ts';
export {
  descartarRecuperacion,
  finalizarProteccion,
  hayRecuperacionPendiente,
  iniciarProteccion,
  restaurarDesdeRecuperacion,
  VERSION_ESQUEMA_RECOVERY,
  type AlmacenGuardian,
  type RecoveryRecord,
  type ResultadoProteccion,
} from './guardian.ts';
export { generarId } from './id.ts';
export { prepararEntradas, type ResultadoPreparacion } from './prepararSimulacion.ts';
export {
  modeloVacio,
  validarRiskModel,
  VERSION_ESQUEMA_RISK_MODEL,
  type ConfiguracionRiskModel,
  type ConvergenciaRiskModel,
  type ProyectoRiskModel,
  LARGO_MAXIMO_TITULO,
  LARGO_MAXIMO_DESCRIPCION,
  OBJETIVO_PRECISION_POR_DEFECTO,
  type CorrelacionDeclarada,
  type EntradaRiskModel,
  type LocaleRiskModel,
  type ModeloRiesgo,
  type MotorSimulacion,
  type ResultadoValidacion,
  type SalidaRiskModel,
  type UmbralRiskModel,
} from './riskModel.ts';
export {
  ajustarDistribuciones, leerDatos, logDensidad, ordenarCandidatos,
  type AjusteCandidato, type CriterioAjuste, type ResultadoAjuste,
} from './ajuste.ts';
export {
  categoriaDesdeListas,
  discretaDesdeListas,
  FUNCION_CATEGORIA,
  FUNCION_DISCRETA,
  FUNCION_EMPIRICA,
  empiricaDesdeLista,
  FUNCION_TRUNCAR,
  FUNCIONES_RIESGO,
  idDeFuncionRiesgo,
  leerFuncionRiesgo,
  type LectorDeRango,
  mediaDeFuncionRiesgo,
  mencionaRiesgo,
  type FuncionRiesgo,
  type LecturaFuncionRiesgo,
} from './funcionesRiesgo.ts';
export { vistaPrevia, type VistaPrevia } from './vistaPrevia.ts';
