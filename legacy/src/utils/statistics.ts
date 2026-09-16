import type { DistributionType, DistributionParams } from './mathUtils';

// Interfaz para el resultado de un ajuste
export interface FitResult {
  distribution: DistributionType;
  params: DistributionParams;
  score: number; // A lower score means a better fit (e.g., SSE or KS statistic)
  name: string;
}

// Interfaz para estadísticas descriptivas
export interface DescriptiveStats {
  count: number;
  mean: number;
  median: number;
  mode: number;
  stdDev: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
}

/**
 * Calcula las estadísticas descriptivas básicas de un array de números.
 */
export function calculateDescriptiveStats(data: number[]): DescriptiveStats {
  const n = data.length;
  if (n === 0) {
    return { count: 0, mean: 0, median: 0, mode: 0, stdDev: 0, min: 0, max: 0, skewness: 0, kurtosis: 0 };
  }

  // Ordenar para min, max, median
  const sorted = [...data].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  // Moda básica (frecuencia) o agrupada si es continuo
  // Para datos continuos usaremos una aproximación simple de Scott's rule para bins
  let mode = median;
  const binWidth = 3.49 * getStdDev(data) / Math.pow(n, 1/3);
  if (binWidth > 0) {
    const bins: { [key: number]: number } = {};
    for (const val of data) {
      const binIdx = Math.floor((val - min) / binWidth);
      bins[binIdx] = (bins[binIdx] || 0) + 1;
    }
    let maxBinCount = -1;
    let maxBinIdx = 0;
    for (const binIdxStr in bins) {
      const count = bins[binIdxStr];
      if (count > maxBinCount) {
        maxBinCount = count;
        maxBinIdx = parseInt(binIdxStr);
      }
    }
    mode = min + (maxBinIdx + 0.5) * binWidth;
  }

  const mean = data.reduce((sum, val) => sum + val, 0) / n;
  
  let sumSqDiff = 0;
  let sumCubeDiff = 0;
  let sumQuadDiff = 0;

  for (const val of data) {
    const diff = val - mean;
    const sq = diff * diff;
    sumSqDiff += sq;
    sumCubeDiff += sq * diff;
    sumQuadDiff += sq * sq;
  }

  const variance = sumSqDiff / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);

  // Sesgo y Curtosis
  let skewness = 0;
  let kurtosis = 0;
  if (stdDev > 0 && n > 2) {
    skewness = (n * sumCubeDiff) / ((n - 1) * (n - 2) * Math.pow(stdDev, 3));
    kurtosis = (n * (n + 1) * sumQuadDiff) / ((n - 1) * (n - 2) * (n - 3) * Math.pow(stdDev, 4)) 
               - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  }

  return { count: n, mean, median, mode, stdDev, min, max, skewness, kurtosis };
}

function getStdDev(data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (data.length - 1);
  return Math.sqrt(variance);
}

/**
 * Erf function (approximation) needed for Normal CDF
 */
function erf(x: number): number {
  // Save the sign of x
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);

  // A&S formula 7.1.26
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/**
 * CDF Teóricas
 */
const theoreticalCDFs = {
  normal: (x: number, params: DistributionParams) => {
    const { mean, stdDev } = params;
    if (!stdDev) return 0;
    return 0.5 * (1 + erf((x - mean!) / (stdDev! * Math.sqrt(2))));
  },
  uniform: (x: number, params: DistributionParams) => {
    const { min, max } = params;
    if (x < min!) return 0;
    if (x > max!) return 1;
    if (min === max) return 1;
    return (x - min!) / (max! - min!);
  },
  triangular: (x: number, params: DistributionParams) => {
    const { min, max, mostLikely } = params;
    const a = min!, b = max!, c = mostLikely!;
    if (x <= a) return 0;
    if (x >= b) return 1;
    if (b === a) return 1;
    if (x <= c) {
      return Math.pow(x - a, 2) / ((b - a) * (c - a));
    } else {
      return 1 - Math.pow(b - x, 2) / ((b - a) * (b - c));
    }
  },
  lognormal: (x: number, params: DistributionParams) => {
    const { mean, stdDev } = params;
    if (x <= 0) return 0;
    // For lognormal fitting, mean and stdDev refer to the underlying normal
    return 0.5 * (1 + erf((Math.log(x) - mean!) / (stdDev! * Math.sqrt(2))));
  },
  bernoulli: (x: number, params: DistributionParams) => {
    const p = params.probability!;
    if (x < 0) return 0;
    if (x < 1) return 1 - p;
    return 1;
  },
  poisson: (x: number, params: DistributionParams) => {
    const lambda = params.lambda!;
    if (x < 0) return 0;
    let sum = 0;
    let k = Math.floor(x);
    let term = Math.exp(-lambda);
    sum += term;
    for (let i = 1; i <= k; i++) {
       term = term * (lambda / i);
       sum += term;
    }
    return sum;
  },
  binomial: (x: number, params: DistributionParams) => {
    const n = params.trials!;
    const p = params.probability!;
    if (x < 0) return 0;
    if (x >= n) return 1;
    let sum = 0;
    let k = Math.floor(x);
    for (let i = 0; i <= k; i++) {
        let c = 1;
        for (let j = 1; j <= i; j++) {
            c = c * (n - j + 1) / j;
        }
        sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
    }
    return sum;
  },
  discrete_uniform: (x: number, params: DistributionParams) => {
     const min = params.min!;
     const max = params.max!;
     if (x < min) return 0;
     if (x >= max) return 1;
     let k = Math.floor(x);
     return (k - min + 1) / (max - min + 1);
  },
  custom_discrete: (x: number, params: DistributionParams) => {
     const values = params.discreteValues!;
     let sum = 0;
     for (const item of values) {
         if (item.value <= x) {
             sum += item.probability;
         }
     }
     return sum;
  }
};

/**
 * Evalúa el ajuste de las distribuciones y devuelve un ranking.
 * Utiliza una métrica similar a Kolmogorov-Smirnov (KS distance).
 */
export function fitDistributions(data: number[]): FitResult[] {
  const stats = calculateDescriptiveStats(data);
  const sortedData = [...data].sort((a, b) => a - b);
  const n = data.length;
  
  if (n === 0) return [];

  const candidates: { type: DistributionType, name: string, params: DistributionParams }[] = [];

  // Normal
  candidates.push({
    type: 'normal',
    name: 'Normal',
    params: { mean: stats.mean, stdDev: stats.stdDev }
  });

  // Uniform
  candidates.push({
    type: 'uniform',
    name: 'Uniforme',
    params: { min: stats.min, max: stats.max }
  });

  // Triangular
  // A heuristic: mostly likely is the mode
  candidates.push({
    type: 'triangular',
    name: 'Triangular',
    params: { min: stats.min, max: stats.max, mostLikely: stats.mode }
  });

  // Lognormal (only if all data > 0)
  if (stats.min > 0) {
    const logData = data.map(x => Math.log(x));
    const logStats = calculateDescriptiveStats(logData);
    candidates.push({
      type: 'lognormal',
      name: 'Lognormal',
      params: { mean: logStats.mean, stdDev: logStats.stdDev }
    });
  }

  // Bernoulli (only if data is exactly 0 and 1)
  const isBinary = data.every(x => x === 0 || x === 1);
  if (isBinary) {
    candidates.push({
      type: 'bernoulli',
      name: 'Bernoulli',
      params: { probability: stats.mean }
    });
  }

  // PERT
  // PERT uses same params as Triangular but a different shape.
  // We'll estimate the same way.
  candidates.push({
    type: 'pert',
    name: 'PERT',
    params: { min: stats.min, max: stats.max, mostLikely: stats.mode }
  });

  const isDiscrete = data.every(x => Number.isInteger(x));

  if (isDiscrete && stats.min >= 0) {
      candidates.push({
          type: 'poisson',
          name: 'Poisson',
          params: { lambda: stats.mean }
      });
      
      const trials = stats.max;
      const prob = trials > 0 ? stats.mean / trials : 0;
      candidates.push({
          type: 'binomial',
          name: 'Binomial',
          params: { trials: trials, probability: prob }
      });

      candidates.push({
          type: 'discrete_uniform',
          name: 'Uniforme Discreta',
          params: { min: stats.min, max: stats.max }
      });
  }

  // Build empirical custom discrete (ALWAYS available)
  const counts: Record<number, number> = {};
  data.forEach(val => {
      counts[val] = (counts[val] || 0) + 1;
  });
  const uniqueVals = Object.keys(counts).map(Number).sort((a,b) => a-b);
  const discreteValues = uniqueVals.map(v => ({ value: v, probability: counts[v] / n }));
  
  candidates.push({
      type: 'custom_discrete',
      name: 'Empírica (Datos Históricos)',
      params: { discreteValues }
  });

  const results: FitResult[] = [];

  // Calculate KS Distance for each candidate
  for (const candidate of candidates) {
    let maxDistance = 0;
    
    // Si es PERT, no tenemos CDF teórica exacta implementada fácilmente, 
    // pero PERT es Beta modificada. Usaremos una aproximación simple sumando error para evaluarlo 
    // o podemos simplemente saltar el KS estricto y darle una penalización si la asimetría no coincide.
    // Para mantenerlo simple, usaremos el mismo CDF de triangular para el ranking pero le sumaremos
    // una penalización.
    let cdfFunc = theoreticalCDFs[candidate.type as keyof typeof theoreticalCDFs];
    
    if (candidate.type === 'pert') {
        cdfFunc = theoreticalCDFs['triangular']; // Fallback proxy for ranking calculation
    }

    if (cdfFunc) {
      for (let i = 0; i < n; i++) {
        const x = sortedData[i];
        const empiricalCdf = (i + 1) / n;
        const theoreticalCdf = cdfFunc(x, candidate.params);
        const distance = Math.abs(empiricalCdf - theoreticalCdf);
        if (distance > maxDistance) {
          maxDistance = distance;
        }
      }
    } else {
        maxDistance = 999;
    }

    let score = maxDistance;
    if (candidate.type === 'custom_discrete') {
       score = 0; // Perfect fit by definition
    }

    results.push({
      distribution: candidate.type,
      name: candidate.name,
      params: candidate.params,
      score: score // Lower is better
    });
  }

  // Sort by score ascending (best fit first)
  results.sort((a, b) => a.score - b.score);

  return results;
}
