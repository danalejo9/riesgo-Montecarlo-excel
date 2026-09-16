/**
 * Custom Functions for Monte Carlo Simulation
 */

// --- INLINED MATH FUNCTIONS ---
function randomNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); 
  while(v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

function randomLognormal(mean: number, stdDev: number): number {
  return Math.exp(randomNormal(mean, stdDev));
}

function randomBernoulli(probability: number): number {
  return Math.random() <= probability ? 1 : 0;
}

function randomTriangular(min: number, mostLikely: number, max: number): number {
  const u = Math.random();
  const fc = (mostLikely - min) / (max - min);

  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mostLikely - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - mostLikely));
  }
}

function randomPERT(min: number, mostLikely: number, max: number): number {
  const tri = randomTriangular(min, mostLikely, max);
  const mean = (min + 4 * mostLikely + max) / 6;
  return (tri + mean + mostLikely) / 3;
}

function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomPoisson(lambda: number): number {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function randomBinomial(trials: number, probability: number): number {
  let successes = 0;
  for (let i = 0; i < trials; i++) {
    if (Math.random() < probability) {
      successes++;
    }
  }
  return successes;
}
// -----------------------------

declare var CustomFunctions: any;

/**
 * Generates a random number from a normal distribution.
 * @customfunction RIESGO.NORMAL NORMAL
 * @param mean The mean of the normal distribution.
 * @param stdDev The standard deviation.
 * @returns A random number from the normal distribution.
 */
export function normal(mean: number, stdDev: number): number {
  return randomNormal(mean, stdDev);
}

/**
 * Generates a random number from a lognormal distribution.
 * @customfunction RIESGO.LOGNORMAL LOGNORMAL
 * @param mean The mean of the lognormal distribution.
 * @param stdDev The standard deviation.
 * @returns A random number from the lognormal distribution.
 */
export function lognormal(mean: number, stdDev: number): number {
  return randomLognormal(mean, stdDev);
}

/**
 * Generates a random number from a uniform distribution.
 * @customfunction RIESGO.UNIFORME UNIFORME
 * @param min The minimum value.
 * @param max The maximum value.
 * @returns A random number between min and max.
 */
export function uniforme(min: number, max: number): number {
  return randomUniform ? randomUniform(min, max) : Math.random() * (max - min) + min;
}

/**
 * Generates a random number from a triangular distribution.
 * @customfunction RIESGO.TRIANGULAR TRIANGULAR
 * @param min The minimum value.
 * @param mostLikely The most likely value.
 * @param max The maximum value.
 * @returns A random number from the triangular distribution.
 */
export function triangular(min: number, mostLikely: number, max: number): number {
  return randomTriangular(min, mostLikely, max);
}

/**
 * Generates a random number from a PERT distribution.
 * @customfunction RIESGO.PERT PERT
 * @param min The minimum value.
 * @param mostLikely The most likely value.
 * @param max The maximum value.
 * @returns A random number from the PERT distribution.
 */
export function pert(min: number, mostLikely: number, max: number): number {
  return randomPERT(min, mostLikely, max);
}

/**
 * Generates a random number from a Bernoulli distribution.
 * @customfunction RIESGO.BERNOULLI BERNOULLI
 * @param probability The probability of success (0 to 1).
 * @returns A random number (0 or 1).
 */
export function bernoulli(probability: number): number {
  return randomBernoulli(probability);
}

/**
 * Generates a random number from a Poisson distribution.
 * @customfunction RIESGO.POISSON POISSON
 * @param lambda The average rate of success.
 * @returns A random integer from the Poisson distribution.
 */
export function poisson(lambda: number): number {
  return randomPoisson(lambda);
}

/**
 * Generates a random number from a Binomial distribution.
 * @customfunction RIESGO.BINOMIAL BINOMIAL
 * @param trials Number of trials.
 * @param probability The probability of success (0 to 1).
 * @returns A random integer representing number of successes.
 */
export function binomial(trials: number, probability: number): number {
  return randomBinomial(trials, probability);
}

// Ensure the functions are registered globally for Office to find them
Office.onReady(() => {
  console.log("Custom Functions script loaded!");
  
  if (typeof CustomFunctions === 'undefined') {
    (window as any).CustomFunctions = {};
  }
  if (!CustomFunctions.associate) {
    CustomFunctions.associate = function (id: string, func: Function) {
      (window as any)[id] = func;
    };
  }

  CustomFunctions.associate("NORMAL", normal);
  CustomFunctions.associate("UNIFORME", uniforme);
  CustomFunctions.associate("LOGNORMAL", lognormal);
  CustomFunctions.associate("TRIANGULAR", triangular);
  CustomFunctions.associate("PERT", pert);
  CustomFunctions.associate("BERNOULLI", bernoulli);
  CustomFunctions.associate("POISSON", poisson);
  CustomFunctions.associate("BINOMIAL", binomial);
});
