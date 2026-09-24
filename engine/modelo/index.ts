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
export { ajustarDistribuciones, leerDatos, type AjusteCandidato, type ResultadoAjuste } from './ajuste.ts';
