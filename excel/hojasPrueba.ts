/**
 * Las fórmulas que la guía de pruebas (`docs/GUIA_PRUEBAS_EXCEL.md`) pide
 * escribir en las hojas «Pruebas» y «Zonas» del libro de demostración, para
 * escribirlas todas de una vez desde Diagnóstico en vez de a mano. Sin
 * Office.js: las escribe `rellenarHojasPrueba` (Office.js) y se prueban aquí.
 *
 * En inglés y con comas, como las recibe Office.js (`range.formulas`): Excel
 * las enseña traducidas y con punto y coma en un Excel en español. Las
 * posiciones son las del generador (`ejemplos/generar-demo.py`).
 */

export interface FormulaDePrueba {
  hoja: 'Pruebas' | 'Zonas';
  celda: string;
  formula: string;
  /** Sección de la hoja y prueba de la guía que la usa, para el aviso. */
  para: string;
}

export const FORMULAS_DE_PRUEBA: readonly FormulaDePrueba[] = [
  { hoja: 'Pruebas', celda: 'C5', formula: '=RIESGO.NORMAL(1000,150)', para: '1 · F1–F6, N6, N7' },
  { hoja: 'Pruebas', celda: 'C6', formula: '=RIESGO.TRIANGULAR(8,10,14)', para: '1 · F1–F6, N6, N7' },
  { hoja: 'Pruebas', celda: 'C13', formula: '=SUM(FILTER(F13:F17,F13:F17>C12,0))', para: '3 · G2' },
  { hoja: 'Pruebas', celda: 'C14', formula: '=SUMPRODUCT((F13:F17>C12)*F13:F17)', para: '3 · G3' },
  { hoja: 'Pruebas', celda: 'C15', formula: '=INDEX(SORT(F13:F17,1,-1),1)', para: '3 · G3' },
  { hoja: 'Pruebas', celda: 'H13', formula: '=FILTER(E13:E17,F13:F17>C12)', para: '3 · G4 (derrame)' },
  { hoja: 'Pruebas', celda: 'C25', formula: '=RIESGO.DISCRETA(E25:E27,F25:F27)', para: '6 · F7' },
  { hoja: 'Pruebas', celda: 'C26', formula: '=RIESGO.TRUNCAR(RIESGO.NORMAL(100,30),50,150)', para: '6 · F8' },
  { hoja: 'Pruebas', celda: 'C27', formula: '=RIESGO.LOGNORMAL2(4.6,0.2)', para: '6 · F9' },
  { hoja: 'Pruebas', celda: 'C28', formula: '=RIESGO.EMPIRICA(K5:K44)', para: '6 · F10' },
  { hoja: 'Pruebas', celda: 'C34', formula: '=RIESGO.NORMAL(C32,C33)', para: '7 · F12–F15' },
  { hoja: 'Pruebas', celda: 'C35', formula: '=10+RIESGO.NORMAL(0,1)', para: '7 · F12–F15' },
  { hoja: 'Pruebas', celda: 'C36', formula: '=RIESGO.NORMAL(C34,50)', para: '7 · F12–F15' },
  { hoja: 'Pruebas', celda: 'C40', formula: '=RIESGO.MEDIA(C37)', para: '8 · F16–F19' },
  { hoja: 'Pruebas', celda: 'C41', formula: '=RIESGO.PERCENTIL(C37,0.05)', para: '8 · F16–F19' },
  { hoja: 'Pruebas', celda: 'C42', formula: '=RIESGO.PROB(C37,8000)', para: '8 · F16–F19' },
  { hoja: 'Pruebas', celda: 'C43', formula: '=RIESGO.DESV(C37)', para: '8 · F16–F19' },
  { hoja: 'Pruebas', celda: 'C46', formula: '=RIESGO.NORMAL(100,10)', para: '9 · F20–F21' },
  { hoja: 'Pruebas', celda: 'C47', formula: '=RIESGO.NORMAL(50,5)', para: '9 · F20–F21' },
  { hoja: 'Pruebas', celda: 'C48', formula: '=RIESGO.CORRELACION(C46,C47,0.9)', para: '9 · F21' },
  { hoja: 'Pruebas', celda: 'C49', formula: '=RIESGO.SALIDA("Coste total")+C46+C47', para: '9 · F20, N32' },
  { hoja: 'Pruebas', celda: 'C52', formula: '=RIESGO.TRIANGULAR(DATE(2027,1,1),DATE(2027,2,1),DATE(2027,4,1))', para: '10 · T9' },
  { hoja: 'Pruebas', celda: 'C53', formula: '=RIESGO.NORMAL(90,10)', para: '10 · T9' },
  { hoja: 'Pruebas', celda: 'C57', formula: '=RIESGO.EVENTO(0.3,RIESGO.TRIANGULAR(10000,20000,60000))', para: '11 · T10' },
  { hoja: 'Pruebas', celda: 'C58', formula: '=RIESGO.EVENTO(0.1,50000)', para: '11 · T10' },
  { hoja: 'Pruebas', celda: 'C62', formula: '=RIESGO.NORMAL(1000,100)', para: '12 · T11' },
  { hoja: 'Pruebas', celda: 'C63', formula: '=RIESGO.DECISION(8,10,12)', para: '12 · T11' },
  { hoja: 'Zonas', celda: 'C12', formula: '=RIESGO.CATEGORIA(E5:E7,F5:F7)', para: 'T4, N7' },
];

/** Qué celdas de las pedidas ya tienen algo escrito (no se tocan). */
export function yaEscritas(
  formulas: readonly FormulaDePrueba[],
  contenido: (hoja: string, celda: string) => string,
): FormulaDePrueba[] {
  return formulas.filter((f) => contenido(f.hoja, f.celda).trim() !== '');
}
