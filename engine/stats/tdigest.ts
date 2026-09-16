/**
 * t-digest (Dunning, 2019): percentiles aproximados con memoria acotada,
 * para cuando D11 (millones de iteraciones, cientos de salidas) hace
 * inviable guardar y ordenar el buffer completo de cada salida solo para
 * sacar un percentil (Fase 2 §3.3). La UI debe poder decir "este percentil
 * es aproximado" cuando viene de aquí, en vez de `percentiles.ts`.
 *
 * Construcción por lotes a partir de datos ya ordenados (Dunning, Algoritmo
 * 1): se recorren los valores acumulando un "centroide" (media, peso)
 * mientras la posición acumulada de cuantil no cruce el límite que marca la
 * función de escala `k1`; al cruzarlo, se cierra el centroide y se abre uno
 * nuevo. La función de escala concentra centroides pequeños (precisos) cerca
 * de las colas y los ensancha hacia la mediana, que es donde la precisión
 * relativa importa menos.
 *
 * La combinación de varios digests (uno por bloque o por worker) es el mismo
 * algoritmo aplicado sobre los centroides de todos ellos como si fueran
 * puntos con peso — no hace falta un algoritmo de fusión aparte.
 */
export interface Centroide {
  media: number;
  peso: number;
}

export interface TDigest {
  compresion: number;
  centroides: Centroide[];
  pesoTotal: number;
  min: number;
  max: number;
}

function k1(q: number, compresion: number): number {
  return (compresion / (2 * Math.PI)) * Math.asin(2 * q - 1);
}

function k1Inversa(k: number, compresion: number): number {
  return (Math.sin((2 * Math.PI * k) / compresion) + 1) / 2;
}

/** Construye un t-digest a partir de puntos `(valor, peso)`, no necesariamente ordenados. */
export function construirTDigest(
  puntos: ReadonlyArray<readonly [valor: number, peso: number]>,
  compresion = 100,
): TDigest {
  if (puntos.length === 0) {
    return { compresion, centroides: [], pesoTotal: 0, min: Infinity, max: -Infinity };
  }

  const ordenados = puntos.slice().sort((a, b) => a[0] - b[0]);
  const pesoTotal = ordenados.reduce((a, [, w]) => a + w, 0);

  const centroides: Centroide[] = [];
  let q0 = 0;
  let limiteK = k1Inversa(k1(q0, compresion) + 1, compresion);

  let [sigmaValor, sigmaPeso] = [ordenados[0]![0] * ordenados[0]![1], ordenados[0]![1]];

  for (let i = 1; i < ordenados.length; i++) {
    const [valor, peso] = ordenados[i] as [number, number];
    const qTentativa = q0 + (sigmaPeso + peso) / pesoTotal;

    if (qTentativa <= limiteK) {
      sigmaValor += valor * peso;
      sigmaPeso += peso;
    } else {
      centroides.push({ media: sigmaValor / sigmaPeso, peso: sigmaPeso });
      q0 += sigmaPeso / pesoTotal;
      limiteK = k1Inversa(k1(q0, compresion) + 1, compresion);
      sigmaValor = valor * peso;
      sigmaPeso = peso;
    }
  }
  centroides.push({ media: sigmaValor / sigmaPeso, peso: sigmaPeso });

  return {
    compresion,
    centroides,
    pesoTotal,
    min: ordenados[0]![0],
    max: ordenados[ordenados.length - 1]![0],
  };
}

/** Construye un t-digest directamente de una muestra (peso 1 por valor). */
export function tdigestDeBuffer(buffer: Float64Array, compresion = 100): TDigest {
  const puntos: Array<[number, number]> = new Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) puntos[i] = [buffer[i] as number, 1];
  return construirTDigest(puntos, compresion);
}

/**
 * Combina varios digests parciales (de bloques o workers distintos) en uno
 * solo, reconstruyendo con el mismo algoritmo de lotes sobre sus centroides.
 */
export function combinarTDigest(digests: readonly TDigest[], compresion?: number): TDigest {
  const conPeso = digests.filter((d) => d.pesoTotal > 0);
  if (conPeso.length === 0) {
    return { compresion: compresion ?? (digests[0]?.compresion ?? 100), centroides: [], pesoTotal: 0, min: Infinity, max: -Infinity };
  }
  const puntos = conPeso.flatMap((d) => d.centroides.map(({ media, peso }) => [media, peso] as const));
  const combinado = construirTDigest(puntos, compresion ?? (conPeso[0] as TDigest).compresion);
  combinado.min = Math.min(...conPeso.map((d) => d.min));
  combinado.max = Math.max(...conPeso.map((d) => d.max));
  return combinado;
}

/**
 * Cuantil aproximado: interpola linealmente sobre el punto medio (en peso
 * acumulado) de cada centroide, con `min`/`max` reales como anclas en los
 * extremos — la técnica estándar de las implementaciones de referencia para
 * no perder precisión justo en las colas, que es donde más importa en un
 * análisis de riesgo.
 */
export function cuantilTDigest(digest: TDigest, q: number): number {
  if (!(q >= 0 && q <= 1)) throw new Error(`TDIGEST: q debe estar en [0,1] (recibido ${q})`);
  if (digest.centroides.length === 0) return NaN;
  if (digest.centroides.length === 1) return digest.centroides[0]!.media;

  const objetivo = q * digest.pesoTotal;

  const medios: number[] = [];
  let acumulado = 0;
  for (const c of digest.centroides) {
    medios.push(acumulado + c.peso / 2);
    acumulado += c.peso;
  }

  if (objetivo <= (medios[0] as number)) {
    return interpolar(0, digest.min, medios[0] as number, digest.centroides[0]!.media, objetivo);
  }
  const ultimo = medios.length - 1;
  if (objetivo >= (medios[ultimo] as number)) {
    return interpolar(medios[ultimo] as number, digest.centroides[ultimo]!.media, digest.pesoTotal, digest.max, objetivo);
  }

  for (let i = 0; i < medios.length - 1; i++) {
    if (objetivo <= (medios[i + 1] as number)) {
      return interpolar(
        medios[i] as number,
        digest.centroides[i]!.media,
        medios[i + 1] as number,
        digest.centroides[i + 1]!.media,
        objetivo,
      );
    }
  }
  return digest.centroides[ultimo]!.media;
}

function interpolar(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}
