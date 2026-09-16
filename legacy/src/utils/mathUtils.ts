// Math and Statistical Utilities for Monte Carlo Simulation

export type DistributionType = 'normal' | 'triangular' | 'uniform' | 'lognormal' | 'bernoulli' | 'pert' | 'poisson' | 'binomial' | 'discrete_uniform' | 'custom_discrete';

export interface DistributionParams {
  mean?: number;      // Normal, Lognormal
  stdDev?: number;    // Normal, Lognormal
  min?: number;       // Triangular, Uniform, Discrete Uniform
  max?: number;       // Triangular, Uniform, Discrete Uniform
  mostLikely?: number; // Triangular
  probability?: number; // Bernoulli, Binomial
  lambda?: number;      // Poisson
  trials?: number;      // Binomial
  discreteValues?: { value: number; probability: number }[]; // Custom Discrete
}

export interface VariableInput {
  id: string;
  name: string;
  cellAddress: string;
  type: DistributionType;
  params: DistributionParams;
  currentValue: number | string; // Permit string for formula
}

export function getExcelFormulaForDistribution(type: DistributionType, params: DistributionParams): string {
  switch (type) {
    case 'normal':
      return `=RIESGO.NORMAL(${params.mean}, ${params.stdDev})`;
    case 'lognormal':
      return `=RIESGO.LOGNORMAL(${params.mean}, ${params.stdDev})`;
    case 'uniform':
      return `=RIESGO.UNIFORME(${params.min}, ${params.max})`;
    case 'discrete_uniform':
      // Podemos mantener RANDBETWEEN o crear una RIESGO.DISCRETA_UNIFORME, pero RANDBETWEEN es suficientemente nativo y fácil.
      return `=RANDBETWEEN(${params.min}, ${params.max})`;
    case 'bernoulli':
      return `=RIESGO.BERNOULLI(${params.probability})`;
    case 'triangular':
      return `=RIESGO.TRIANGULAR(${params.min}, ${params.mostLikely}, ${params.max})`;
    case 'pert':
      return `=RIESGO.PERT(${params.min}, ${params.mostLikely}, ${params.max})`;
    case 'poisson':
      return `=RIESGO.POISSON(${params.lambda})`;
    case 'binomial':
      return `=RIESGO.BINOMIAL(${params.trials}, ${params.probability})`;
    default:
      return '';
  }
}

export interface VariableOutput {
  id: string;
  name: string;
  cellAddress: string;
  currentValue: number;
}

export interface SensitivityData {
  inputId: string;
  inputName: string;
  correlation: number; // Pearson correlation coefficient
}

export interface SimulationResult {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p10: number; 
  p50: number; 
  p90: number; 
  dataPoints: number[];
  histogram: { binStart: number; binEnd: number; count: number }[];
  sensitivity?: SensitivityData[]; // Added for Tornado chart
}

// --- Pseudo-Random Number Generator (PRNG) ---
// Mulberry32 generator for seeded pseudo-random numbers
let _seed = 123456789;

export function setSeed(seed: number) {
  _seed = seed;
}

export function prng(): number {
  let t = _seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// Generates a random number from a standard normal distribution (Box-Muller transform)
export function randomNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while(u === 0) u = prng(); 
  while(v === 0) v = prng();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

// Generates a random number from a Lognormal distribution
export function randomLognormal(mean: number, stdDev: number): number {
  // mean and stdDev are for the underlying normal distribution
  return Math.exp(randomNormal(mean, stdDev));
}

// Generates a random number from a Bernoulli (Discrete Binary) distribution
export function randomBernoulli(probability: number): number {
  return prng() <= probability ? 1 : 0;
}

// Generates a random number from a triangular distribution
export function randomTriangular(min: number, mostLikely: number, max: number): number {
  const u = prng();
  const fc = (mostLikely - min) / (max - min);

  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mostLikely - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - mostLikely));
  }
}

// Generates a random number from a PERT distribution (using Beta approximation)
// Since we don't have a native Beta generator, we use a simple approximation
// often used in risk analysis when Beta is unavailable, or we can use a rejection sampling for Beta.
// For simplicity and speed in JS, we'll use a modified triangular that mimics PERT's kurtosis.
export function randomPERT(min: number, mostLikely: number, max: number): number {
  // A true PERT is Beta(alpha, beta) on [min, max]. 
  // We approximate using a mixture or by generating multiple triangulars and averaging, 
  // but a faster approximation is a triangular distribution where the peak is heavily weighted.
  // We'll use a pseudo-beta by combining uniform and triangular or using the precise Beta generator.
  // Actually, we can use a simple rejection sampling for Beta(alpha, beta) if needed.
  // For V2, a weighted average of triangular and mostLikely gives a PERT-like shape:
  const tri = randomTriangular(min, mostLikely, max);
  // Pull it closer to the mean (min + 4*mostLikely + max)/6
  const mean = (min + 4 * mostLikely + max) / 6;
  return (tri + mean + mostLikely) / 3; // Simple fast approximation
}

// Generates a random number from a uniform distribution
export function randomUniform(min: number, max: number): number {
  return min + prng() * (max - min);
}

// Generates a random number from a Poisson distribution (Knuth's algorithm)
export function randomPoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= prng();
  } while (p > L);
  return k - 1;
}

// Generates a random number from a Binomial distribution
export function randomBinomial(n: number, p: number): number {
  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (prng() < p) {
      successes++;
    }
  }
  return successes;
}

// Generates a random number from a Discrete Uniform distribution
export function randomDiscreteUniform(min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

// Generates a random number from a Custom Discrete distribution
export function randomCustomDiscrete(values: { value: number; probability: number }[]): number {
  if (!values || values.length === 0) return 0;
  const u = prng();
  let cumulative = 0;
  for (const item of values) {
    cumulative += item.probability;
    if (u <= cumulative) {
      return item.value;
    }
  }
  return values[values.length - 1].value;
}

// Sample from a distribution based on its configuration
export function sampleDistribution(type: DistributionType, params: DistributionParams): number {
  switch (type) {
    case 'normal':
      return randomNormal(params.mean ?? 0, params.stdDev ?? 1);
    case 'lognormal':
      return randomLognormal(params.mean ?? 0, params.stdDev ?? 1);
    case 'bernoulli':
      return randomBernoulli(params.probability ?? 0.5);
    case 'triangular':
      return randomTriangular(params.min ?? 0, params.mostLikely ?? 5, params.max ?? 10);
    case 'pert':
      return randomPERT(params.min ?? 0, params.mostLikely ?? 5, params.max ?? 10);
    case 'uniform':
      return randomUniform(params.min ?? 0, params.max ?? 1);
    case 'poisson':
      return randomPoisson(params.lambda ?? 1);
    case 'binomial':
      return randomBinomial(params.trials ?? 10, params.probability ?? 0.5);
    case 'discrete_uniform':
      return randomDiscreteUniform(params.min ?? 0, params.max ?? 10);
    case 'custom_discrete':
      return randomCustomDiscrete(params.discreteValues ?? [{value: 0, probability: 1}]);
    default:
      return 0;
  }
}

// Pearson Correlation Coefficient for Tornado Chart
export function calculateCorrelation(x: number[], y: number[]): number {
  if (!x || !y || x.length !== y.length || x.length === 0) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  
  const sumXY = x.reduce((a, b, i) => a + (b * y[i]), 0);
  const sumX2 = x.reduce((a, b) => a + (b * b), 0);
  const sumY2 = y.reduce((a, b) => a + (b * b), 0);
  
  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

// Helper to calculate percentiles from a sorted array
function getPercentile(sortedData: number[], percentile: number): number {
  if (sortedData.length === 0) return 0;
  const index = (percentile / 100) * (sortedData.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

// Calculates statistics and bins for histogram
export function analyzeResults(dataPoints: number[], numBins: number = 20): SimulationResult {
  const n = dataPoints.length;
  if (n === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0, dataPoints: [], histogram: [] };
  }

  // Sort data for median, percentiles, min, max
  const sorted = [...dataPoints].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Mean
  const sum = dataPoints.reduce((acc, val) => acc + val, 0);
  const mean = sum / n;

  // Standard Deviation
  const variance = dataPoints.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const p10 = getPercentile(sorted, 10);
  const p50 = getPercentile(sorted, 50); // Median
  const p90 = getPercentile(sorted, 90);

  // Generate Histogram Bins
  const histogram: { binStart: number; binEnd: number; count: number }[] = [];
  const range = max - min;
  const binWidth = range === 0 ? 1 : range / numBins;

  for (let i = 0; i < numBins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    histogram.push({ binStart, binEnd, count: 0 });
  }

  // Populate bins
  dataPoints.forEach((val) => {
    let binIndex = Math.floor((val - min) / binWidth);
    if (binIndex >= numBins) binIndex = numBins - 1; // Edge case for max value
    if (binIndex < 0) binIndex = 0;
    histogram[binIndex].count++;
  });

  return {
    mean,
    median: p50,
    stdDev,
    min,
    max,
    p10,
    p50,
    p90,
    dataPoints: sorted,
    histogram,
  };
}

// --- Distribution Fitting (Kolmogorov-Smirnov Test) ---

// Error function approximation
export function erf(x: number): number {
  // save the sign of x
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);

  // constants
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  // A&S formula 7.1.26
  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

  return sign*y;
}

// Normal CDF
export function normalCDF(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (stdDev * Math.sqrt(2))));
}

// Lognormal CDF
export function lognormalCDF(x: number, mu: number, sigma: number): number {
  if (x <= 0) return 0;
  if (sigma === 0) return Math.log(x) >= mu ? 1 : 0;
  return 0.5 * (1 + erf((Math.log(x) - mu) / (sigma * Math.sqrt(2))));
}

// Uniform CDF
export function uniformCDF(x: number, min: number, max: number): number {
  if (x < min) return 0;
  if (x > max) return 1;
  if (min === max) return 1;
  return (x - min) / (max - min);
}

export interface FitResult {
  distribution: string;
  ksStatistic: number;
  params: any;
}

export function fitDistribution(dataPoints: number[]): { bestFit: FitResult; allFits: FitResult[] } | null {
  if (!dataPoints || dataPoints.length === 0) return null;

  const sorted = [...dataPoints].sort((a, b) => a - b);
  const n = sorted.length;

  // 1. Estimate Normal parameters
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);

  // 2. Estimate Lognormal parameters (only if all data > 0)
  let logMean = 0;
  let logStdDev = 0;
  const allPositive = sorted[0] > 0;
  if (allPositive) {
    const logData = sorted.map(x => Math.log(x));
    const logSum = logData.reduce((a, b) => a + b, 0);
    logMean = logSum / n;
    const logVariance = logData.reduce((acc, val) => acc + Math.pow(val - logMean, 2), 0) / (n - 1 || 1);
    logStdDev = Math.sqrt(logVariance);
  }

  // 3. Estimate Uniform parameters
  const min = sorted[0];
  const max = sorted[n - 1];

  // Calculate KS Statistic for each
  let ksNormal = 0;
  let ksLognormal = 0;
  let ksUniform = 0;

  for (let i = 0; i < n; i++) {
    const x = sorted[i];
    const empiricalCDF = (i + 1) / n;

    // Normal
    const nCDF = normalCDF(x, mean, stdDev);
    ksNormal = Math.max(ksNormal, Math.abs(empiricalCDF - nCDF));

    // Lognormal
    if (allPositive) {
      const lCDF = lognormalCDF(x, logMean, logStdDev);
      ksLognormal = Math.max(ksLognormal, Math.abs(empiricalCDF - lCDF));
    }

    // Uniform
    const uCDF = uniformCDF(x, min, max);
    ksUniform = Math.max(ksUniform, Math.abs(empiricalCDF - uCDF));
  }

  const fits: FitResult[] = [
    { distribution: 'Normal', ksStatistic: ksNormal, params: { mean, stdDev } },
    { distribution: 'Uniforme', ksStatistic: ksUniform, params: { min, max } }
  ];

  if (allPositive) {
    fits.push({ distribution: 'Lognormal', ksStatistic: ksLognormal, params: { logMean, logStdDev, mean, stdDev } });
  }

  // Calculate empirical discrete distribution
  const counts: { [key: number]: number } = {};
  for (const val of dataPoints) {
    counts[val] = (counts[val] || 0) + 1;
  }
  const discreteValues = Object.entries(counts).map(([valStr, count]) => ({
    value: parseFloat(valStr),
    probability: count / n
  }));
  
  // Add Empirical Custom Distribution as a 0-KS (perfect empirical fit) option
  fits.push({ distribution: 'Empírica (Histórica)', ksStatistic: 0, params: { discreteValues } });

  // Sort by KS ascending (lower is better)
  fits.sort((a, b) => a.ksStatistic - b.ksStatistic);

  return {
    bestFit: fits[0],
    allFits: fits
  };
}


