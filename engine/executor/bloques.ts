/**
 * Tamaño de bloque adaptativo (Fase 2 §3.1).
 *
 * El motor no reserva `celdas × n × 8 bytes` de una vez — eso es justo lo
 * que hace inviable D11 (cientos de variables, millones de iteraciones).
 * Procesa en bloques cuyo tamaño se ajusta para que el conjunto de buffers
 * "vivos" en un momento dado quepa en un presupuesto de memoria fijo: con
 * pocos buffers vivos el bloque es grande (mejor uso de caché, menos
 * bloques); con muchas variables declaradas, el bloque se encoge. El coste
 * por muestra no cambia — el bucle interno sigue siendo plano y contiguo — ,
 * solo cambia cuántas veces se repite.
 *
 * Fórmula exacta de Fase 2 §3.1:
 * `tamañoBloque = clamp(presupuestoBytesPorWorker / (buffersVivos × 8), 4096, 65536)`.
 */
const PRESUPUESTO_BYTES_POR_DEFECTO = 8 * 1024 * 1024; // 8 MB por worker
const TAMANO_MINIMO = 4096;
const TAMANO_MAXIMO = 65536;

export function tamanoBloqueAdaptativo(
  buffersVivos: number,
  presupuestoBytes: number = PRESUPUESTO_BYTES_POR_DEFECTO,
): number {
  if (buffersVivos <= 0) return TAMANO_MAXIMO;
  const crudo = Math.floor(presupuestoBytes / (buffersVivos * 8));
  return Math.min(TAMANO_MAXIMO, Math.max(TAMANO_MINIMO, crudo));
}

export interface Bloque {
  inicio: number;
  largo: number;
}

/** Trocea `[0, n)` en bloques de a lo sumo `tamano` elementos. */
export function particionarEnBloques(n: number, tamano: number): Bloque[] {
  if (n <= 0) return [];
  const t = Math.max(1, Math.floor(tamano));
  const bloques: Bloque[] = [];
  for (let inicio = 0; inicio < n; inicio += t) {
    bloques.push({ inicio, largo: Math.min(t, n - inicio) });
  }
  return bloques;
}
