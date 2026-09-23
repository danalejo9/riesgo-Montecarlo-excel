/**
 * La configuración regional, leída de Excel y no adivinada.
 *
 * El idioma de la interfaz (`es-ES`) no basta para saber el separador decimal:
 * un usuario puede tener Excel en español con el punto como decimal, porque lo
 * cambió en las opciones o porque su Windows está configurado así. Lo que
 * importa es **el separador que Excel está usando de verdad**, y desde la
 * versión 1.11 de la API Excel lo dice:
 *
 * - `application.cultureInfo`: el idioma y los separadores del sistema.
 * - `application.decimalSeparator` / `thousandsSeparator`: los que usa Excel.
 * - `application.useSystemSeparators`: si el usuario los cambió a mano.
 *
 * Si la máquina no tiene la 1.11, se deduce del idioma de Office, que es una
 * aproximación, y se dice que lo es.
 */

import { regionalDesdeIdioma, type ConfiguracionRegional } from '../engine/values/index.ts';
import type { LocaleRiskModel } from '../engine/modelo/index.ts';

export interface RegionalLeida {
  regional: ConfiguracionRegional;
  /** De dónde salió: si se pudo preguntar a Excel o hubo que deducirla. */
  origen: 'excel' | 'deducida';
}

export async function leerRegionalDeExcel(): Promise<RegionalLeida> {
  const idiomaOffice = Office.context.displayLanguage || 'en-US';

  if (!Office.context.requirements.isSetSupported('ExcelApi', '1.11')) {
    return { regional: regionalDesdeIdioma(idiomaOffice), origen: 'deducida' };
  }

  return Excel.run(async (context) => {
    const app = context.workbook.application;
    app.load(['decimalSeparator', 'thousandsSeparator', 'useSystemSeparators']);
    const cultura = app.cultureInfo;
    cultura.load('name');
    cultura.numberFormat.load(['numberDecimalSeparator', 'numberGroupSeparator']);
    await context.sync();

    // Si el usuario cambió los separadores a mano, mandan los de Excel; si no,
    // los del sistema. Las dos lecturas vienen del mismo viaje.
    const decimal = app.useSystemSeparators ? cultura.numberFormat.numberDecimalSeparator : app.decimalSeparator;
    const miles = app.useSystemSeparators ? cultura.numberFormat.numberGroupSeparator : app.thousandsSeparator;

    return {
      regional: regionalDesdeIdioma(cultura.name || idiomaOffice, { decimal, miles }),
      origen: 'excel' as const,
    };
  });
}

/** Lo que se guarda en el modelo: en inglés, como todo `RiskModel v1`. */
export function aLocaleDelModelo(r: ConfiguracionRegional): LocaleRiskModel {
  return { decimalSeparator: r.decimal, thousandsSeparator: r.miles, language: r.idioma };
}

/** Y de vuelta: del modelo guardado a la configuración con la que calcula el motor. */
export function desdeLocaleDelModelo(l: LocaleRiskModel): ConfiguracionRegional {
  return regionalDesdeIdioma(l.language, { decimal: l.decimalSeparator, miles: l.thousandsSeparator });
}
