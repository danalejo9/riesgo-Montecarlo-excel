export { construirHistograma, type Histograma } from './histogram.ts';
export { percentilExacto, percentilesExactos } from './percentiles.ts';
export {
  curvaCDF,
  puntosHistograma,
  resumenEstadistico,
  type BinHistograma,
  type PuntoCDF,
  type ResumenEstadistico,
} from './resumen.ts';
export {
  cuantilTDigest,
  combinarTDigest,
  construirTDigest,
  tdigestDeBuffer,
  type Centroide,
  type TDigest,
} from './tdigest.ts';
export {
  acumular,
  combinar,
  crearWelford,
  varianzaMuestral,
  varianzaPoblacional,
  type EstadoWelford,
} from './welford.ts';
export {
  analizarSensibilidad,
  aranaDeSensibilidad,
  r2Sensibilidad,
  type CurvaArana,
  rangos,
  spearman,
  LIMITE_MUESTRA_SENSIBILIDAD,
  type EntradaSensibilidad,
  type FilaSensibilidad,
} from './sensibilidad.ts';
export { histogramaDeMuestra, ordenarUtiles, probabilidadUmbral } from './muestra.ts';
export { intervaloPercentil, precisionDeSimulacion, siguienteTanda, type IntervaloPercentil, type Precision } from './convergencia.ts';
export { medidasDeRiesgo, type MedidasRiesgo } from './riesgo.ts';
