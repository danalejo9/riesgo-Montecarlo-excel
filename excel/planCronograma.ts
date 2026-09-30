/**
 * W5: el plan del cronograma publicado para `RIESGO.CRONOGRAMA` (lo que
 * enseña fuera de la simulación). Igual que los resultados de B6: en memoria
 * para las funciones del mismo proceso (runtime compartido) y en el almacén de
 * Office (o `localStorage`) para un proceso aparte. Sin Office.js: va también
 * en el paquete de las funciones.
 */

import { CLAVE_PLAN_CRONOGRAMA, leerPlanPublicado, type PlanCronogramaPublicado } from '../engine/cronograma/planPublicado.ts';

interface AlmacenOffice {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
}

const compartido = globalThis as unknown as { __riesgoPlanCronograma?: PlanCronogramaPublicado; OfficeRuntime?: { storage?: AlmacenOffice } };

export async function guardarPlanCronograma(plan: PlanCronogramaPublicado): Promise<void> {
  compartido.__riesgoPlanCronograma = plan;
  const texto = JSON.stringify(plan);
  try {
    await compartido.OfficeRuntime?.storage?.setItem(CLAVE_PLAN_CRONOGRAMA, texto);
  } catch {
    // sigue con localStorage
  }
  try {
    globalThis.localStorage?.setItem(CLAVE_PLAN_CRONOGRAMA, texto);
  } catch {
    // Sin almacén: la función dirá «calcula el cronograma». No rompe nada.
  }
}

let ultimoTexto: string | null = null;
let ultimo: PlanCronogramaPublicado | null = null;

export async function leerPlanCronograma(): Promise<PlanCronogramaPublicado | null> {
  if (compartido.__riesgoPlanCronograma) return compartido.__riesgoPlanCronograma;
  let texto: string | null;
  try {
    texto = (await compartido.OfficeRuntime?.storage?.getItem(CLAVE_PLAN_CRONOGRAMA)) ?? null;
  } catch {
    texto = null;
  }
  if (texto === null) {
    try {
      texto = globalThis.localStorage?.getItem(CLAVE_PLAN_CRONOGRAMA) ?? null;
    } catch {
      texto = null;
    }
  }
  if (texto !== ultimoTexto) {
    ultimoTexto = texto;
    ultimo = leerPlanPublicado(texto);
  }
  return ultimo;
}
