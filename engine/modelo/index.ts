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
  type CorrelacionDeclarada,
  type EntradaRiskModel,
  type ModeloRiesgo,
  type MotorSimulacion,
  type ResultadoValidacion,
  type SalidaRiskModel,
} from './riskModel.ts';
