/** Guarda y lee la plantilla del informe PDF (V3) en el libro (`workbook.settings`). */
import { normalizarPlantilla, type PlantillaInforme } from './plantillaInforme.ts';

export const CLAVE_PLANTILLA = 'riesgoMontecarlo.plantillaInforme';

export async function leerPlantillaInforme(): Promise<PlantillaInforme> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_PLANTILLA);
    ajuste.load('value');
    await context.sync();
    if (ajuste.isNullObject) return normalizarPlantilla(null);
    try {
      return normalizarPlantilla(JSON.parse(String(ajuste.value)));
    } catch {
      return normalizarPlantilla(null);
    }
  });
}

/** Como `leerPlantillaInforme`, pero sin fallar nunca: si el libro no deja leerla, la de por defecto. */
export async function plantillaDelLibro(): Promise<PlantillaInforme> {
  try {
    return await leerPlantillaInforme();
  } catch {
    return normalizarPlantilla(null);
  }
}

export async function guardarPlantillaInforme(p: PlantillaInforme): Promise<void> {
  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_PLANTILLA, JSON.stringify(normalizarPlantilla(p)));
    await context.sync();
  });
}
