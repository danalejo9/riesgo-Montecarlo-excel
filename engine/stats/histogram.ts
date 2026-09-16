/** Histograma de bins iguales sobre `[min, max]`. */
export interface Histograma {
  min: number;
  max: number;
  /** `conteos.length` bins; el bin `i` cubre `[min + i*ancho, min + (i+1)*ancho)`, salvo el último, que incluye `max`. */
  conteos: Int32Array;
  ancho: number;
}

export function construirHistograma(
  buffer: Float64Array,
  bins: number,
  min?: number,
  max?: number,
): Histograma {
  if (!(Number.isInteger(bins) && bins > 0)) throw new Error(`HISTOGRAMA: bins debe ser un entero positivo (recibido ${bins})`);
  if (buffer.length === 0) throw new Error('HISTOGRAMA: el buffer no puede estar vacío');

  let lo = min;
  let hi = max;
  if (lo === undefined || hi === undefined) {
    let calcMin = Infinity;
    let calcMax = -Infinity;
    for (let i = 0; i < buffer.length; i++) {
      const x = buffer[i] as number;
      if (x < calcMin) calcMin = x;
      if (x > calcMax) calcMax = x;
    }
    lo ??= calcMin;
    hi ??= calcMax;
  }
  if (!(lo < hi)) throw new Error(`HISTOGRAMA: se requiere min < max (min=${lo}, max=${hi})`);

  const ancho = (hi - lo) / bins;
  const conteos = new Int32Array(bins);
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i] as number;
    if (x < lo || x > hi) continue; // fuera de rango si min/max se fijaron a mano
    let bin = Math.floor((x - lo) / ancho);
    if (bin >= bins) bin = bins - 1; // el valor == max cae en el último bin, no en uno fuera de rango
    conteos[bin]!++;
  }

  return { min: lo, max: hi, conteos, ancho };
}
