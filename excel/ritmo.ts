/**
 * El ritmo medido del modo compatible, guardado en el libro.
 *
 * Con Excel dentro del bucle el coste por iteración lo pone el modelo del
 * usuario y la máquina donde corre, no nosotros. **Medido en un libro real:
 * 33 iteraciones por segundo** (10.000 iteraciones en 5 min 4 s, Excel de
 * escritorio en Windows, un modelo de 63 celdas). La auditoría del motor
 * heredado suponía ~93; era casi tres veces optimista.
 *
 * Lo que ese número significa, y por qué merece guardarse:
 *
 * |  iteraciones  |     tiempo |
 * |--------------:|-----------:|
 * |         1.000 |     30 s   |
 * |        10.000 |      5 min |
 * |       100.000 |     51 min |
 * |     1.000.000 |      8,4 h |
 *
 * Un millón de iteraciones en modo compatible es una jornada entera. Eso no se
 * puede ofrecer con un desplegable inocente que diga "1.000.000" igual que en
 * el motor rápido, donde son 400 ms.
 *
 * Se guarda **en el libro** y no en el navegador porque es una propiedad de
 * este modelo en esta máquina: el mismo libro en un portátil más lento da otro
 * número, y el mismo Excel con un modelo de 10.000 celdas también. Guardarlo
 * evita tener que volver a medir cada vez que se abre el panel.
 */

export const CLAVE_RITMO = 'riesgoMontecarlo.ritmoCompatible';

export interface RitmoGuardado {
  iteracionesPorSegundo: number;
  /** ISO 8601, para poder decir "medido hace un rato" y no fingir que es de ahora. */
  medidoEn: string;
  /** Cuántas celdas tenía el modelo al medirlo: si cambia mucho, el ritmo ya no vale. */
  celdas: number;
}

export async function leerRitmo(): Promise<RitmoGuardado | undefined> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_RITMO);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    if (ajuste.isNullObject) return undefined;

    try {
      const dato = JSON.parse(typeof ajuste.value === 'string' ? ajuste.value : '{}') as Partial<RitmoGuardado>;
      return typeof dato.iteracionesPorSegundo === 'number' && dato.iteracionesPorSegundo > 0
        ? {
            iteracionesPorSegundo: dato.iteracionesPorSegundo,
            medidoEn: typeof dato.medidoEn === 'string' ? dato.medidoEn : '',
            celdas: typeof dato.celdas === 'number' ? dato.celdas : 0,
          }
        : undefined;
    } catch {
      return undefined;
    }
  });
}

export async function guardarRitmo(ritmo: RitmoGuardado): Promise<void> {
  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_RITMO, JSON.stringify(ritmo));
    await context.sync();
  });
}
