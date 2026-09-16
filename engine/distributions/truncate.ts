import type { Distribution } from './types.ts';

/**
 * Truncamiento genérico aplicable a cualquier distribución (Fase 2 §8): la
 * masa fuera de `[min, max]` se descarta y se reescala. Es una envoltura, no
 * una distribución nueva — funciona igual sobre Normal, Gamma, Beta, etc.,
 * porque solo necesita `cdf` y `quantile` de la base.
 */
export function truncar(base: Distribution, min: number, max: number): Distribution {
  if (!(min < max)) throw new Error(`TRUNCATE: se requiere min < max (min=${min}, max=${max})`);

  const fMin = base.cdf(min);
  const fMax = base.cdf(max);
  const masa = fMax - fMin;
  if (!(masa > 0)) {
    throw new Error('TRUNCATE: el rango [min, max] no contiene masa de probabilidad de la distribución base');
  }

  return {
    quantile: (u) => base.quantile(fMin + u * masa),
    cdf: (x) => {
      if (x <= min) return 0;
      if (x >= max) return 1;
      return (base.cdf(x) - fMin) / masa;
    },
    // Media y varianza exactas del truncamiento requerirían la integral de la
    // base en [min, max]; se aproximan por cuadratura sobre el cuantil, que
    // vale para cualquier distribución sin necesitar una fórmula por caso.
    mean: () => integrarMedia(base, fMin, fMax),
    variance: () => {
      const media = integrarMedia(base, fMin, fMax);
      return integrarSegundoMomento(base, fMin, fMax) - media * media;
    },
  };
}

const PUNTOS_CUADRATURA = 2000;

function integrarMedia(base: Distribution, fMin: number, fMax: number): number {
  return integrarSobreCuantil(base, fMin, fMax, (x) => x);
}

function integrarSegundoMomento(base: Distribution, fMin: number, fMax: number): number {
  return integrarSobreCuantil(base, fMin, fMax, (x) => x * x);
}

/** Regla del punto medio sobre `u` en `[fMin, fMax]`, transformada por `quantile`. */
function integrarSobreCuantil(
  base: Distribution,
  fMin: number,
  fMax: number,
  f: (x: number) => number,
): number {
  const masa = fMax - fMin;
  const paso = masa / PUNTOS_CUADRATURA;
  let suma = 0;
  for (let i = 0; i < PUNTOS_CUADRATURA; i++) {
    const u = fMin + paso * (i + 0.5);
    suma += f(base.quantile(u));
  }
  return suma / PUNTOS_CUADRATURA;
}
