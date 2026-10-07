/**
 * W5: lo que enseña `RIESGO.CRONOGRAMA` en la hoja fuera de la simulación: el
 * valor del **plan** (las duraciones de la hoja, sin riesgos), como hace
 * cualquier celda del modelo de costos con su valor base. Lo publica el panel
 * Cronograma al calcular, y la función lo lee (`ui/funciones.ts`).
 *
 * Módulo pequeño y sin dependencias a propósito: va dentro del paquete de las
 * funciones personalizadas, que no debe cargar el motor del cronograma.
 */

/** Lo que se mide del hito. */
export type MedidaCronograma = 'fecha' | 'dias' | 'retraso' | 'multa' | 'costo';
export const MEDIDAS_CRONOGRAMA: readonly MedidaCronograma[] = ['fecha', 'dias', 'retraso', 'multa', 'costo'];

/** Los nombres que se aceptan para el fin del proyecto (y el hito vacío). */
export const NOMBRES_PROYECTO: ReadonlySet<string> = new Set(['', 'proyecto', 'fin', 'fin del proyecto', 'project']);

const SINONIMOS: Record<string, MedidaCronograma> = {
  fecha: 'fecha', date: 'fecha', fin: 'fecha',
  dias: 'dias', dia: 'dias', duracion: 'dias', plazo: 'dias', days: 'dias', duration: 'dias',
  retraso: 'retraso', atraso: 'retraso', delay: 'retraso',
  multa: 'multa', multas: 'multa', penalty: 'multa',
  costo: 'costo', costos: 'costo', coste: 'costo', cost: 'costo',
};

/** Para comparar lo escrito: sin tildes, en minúsculas y sin espacios a los lados. */
export const normalizarTexto = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** La medida escrita en la fórmula (`"días"`, `"Fecha"`…), o `null` si no es ninguna. Vacía: la fecha. */
export function medidaDe(texto: string | undefined): MedidaCronograma | null {
  if (texto === undefined || texto.trim() === '') return 'fecha';
  return SINONIMOS[normalizarTexto(texto)] ?? null;
}

export const CLAVE_PLAN_CRONOGRAMA = 'riesgoMontecarlo.planCronograma.v1';

export interface PlanCronogramaPublicado {
  version: 1;
  /** Por hito (ID normalizado; '' el proyecto) y medida: `"h3|fecha"`. */
  valores: Record<string, number>;
  /** Nombre normalizado → ID normalizado (solo los nombres que no se repiten). */
  nombres: Record<string, string>;
}

export function leerPlanPublicado(texto: string | null | undefined): PlanCronogramaPublicado | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as Partial<PlanCronogramaPublicado>;
    return j.version === 1 && j.valores && j.nombres ? (j as PlanCronogramaPublicado) : null;
  } catch {
    return null;
  }
}

/** El valor del plan para `RIESGO.CRONOGRAMA(hito; medida)`, o por qué no lo hay. */
export function valorDelPlan(plan: PlanCronogramaPublicado | null, hito: string, medida: string): number | string {
  const m = medidaDe(medida);
  if (!m) return `La medida «${medida}» no existe: usa ${MEDIDAS_CRONOGRAMA.map((x) => `"${x}"`).join(', ')}`;
  if (!plan) return 'Calcula el cronograma en el panel Cronograma para ver aquí el valor del plan';
  const h = normalizarTexto(hito);
  const id = NOMBRES_PROYECTO.has(h) ? '' : plan.valores[`${h}|fecha`] !== undefined ? h : plan.nombres[h];
  if (id === undefined) return `No hay ninguna actividad con el ID o el nombre «${hito}»`;
  const v = plan.valores[`${id}|${m}`];
  if (v === undefined) {
    return m === 'costo' ? 'El costo es del proyecto entero y solo si el cronograma tiene costos'
      : m === 'retraso' || m === 'multa' ? `«${hito}» no tiene fecha contractual en la hoja «Hitos»`
      : `«${hito}» no tiene ${m}`;
  }
  return v;
}
