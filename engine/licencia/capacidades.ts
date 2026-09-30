/**
 * Qué partes del producto están habilitadas (decisión 22,
 * `docs/PLAN_CRONOGRAMA_QSRA.md` §5).
 *
 * El modelo de precio todavía no está decidido. Para que cualquiera encaje
 * —planes, plan único, licencia perpetua— sin tocar los módulos, el panel y
 * la simulación preguntan aquí si una capacidad está activa y nada más.
 * Cómo se decide (licencia firmada, activación…) es E10; hasta entonces,
 * todo habilitado.
 */

export type Capacidad = 'costo' | 'cronograma' | 'jcl';

export const TODAS_LAS_CAPACIDADES: readonly Capacidad[] = ['costo', 'cronograma', 'jcl'];

let activas: ReadonlySet<Capacidad> = new Set(TODAS_LAS_CAPACIDADES);

export function tieneCapacidad(c: Capacidad): boolean {
  return activas.has(c);
}

export function capacidadesActivas(): ReadonlySet<Capacidad> {
  return activas;
}

/** Lo fijará la comprobación de licencia (E10). Hoy solo lo usan los tests. */
export function fijarCapacidades(c: Iterable<Capacidad>): void {
  activas = new Set(c);
}
