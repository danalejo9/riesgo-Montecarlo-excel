/**
 * La configuración regional con la que calcula el motor.
 *
 * El Excel del usuario está en español y **escribe `1,5` donde el motor
 * escribía `1.5`**. Parece un detalle de presentación y no lo es: la cuarta
 * tanda del libro de fidelidad lo confirmó por tres sitios distintos.
 *
 * - Un número convertido a texto (`IZQUIERDA(1,5;3)`, `1,5&""`) lleva coma.
 * - Un texto convertido a número (`VALOR("1234.5")`) no acepta el punto: en
 *   español es `#¡VALOR!`, porque el punto es el separador de miles.
 * - Un lógico escrito como texto es `VERDADERO`, no `TRUE`.
 *
 * Los tres cambian **valores**, no solo cómo se ven: un `SI(IZQUIERDA(A1;3)=
 * "1,5";…)` toma una rama u otra según esto.
 *
 * ---
 *
 * **Por qué es un ajuste del módulo y no un argumento.** La conversión entre
 * texto y número ocurre en decenas de sitios —cada función, cada operador,
 * cada comparación— y todos pasan por las cuatro funciones de `coercion.ts`.
 * Pasar la configuración como argumento obligaría a cambiar la firma de todas
 * las funciones del registro y del evaluador para algo que es **el mismo valor
 * durante toda una simulación**. Así que es un ajuste que se fija una vez al
 * empezar (`establecerRegional`) y que se lee en el punto exacto donde hace
 * falta. Es la misma decisión que toma cualquier biblioteca de formato
 * regional.
 *
 * El coste de esa decisión, y cómo se paga: un ajuste de módulo **no cruza de
 * un hilo a otro**. Cada Web Worker o `worker_thread` tiene su propia copia
 * del módulo, así que quien reparte bloques tiene que mandar la configuración
 * con el trabajo y el worker tiene que fijarla antes de calcular. Ver
 * `engine/executor/simular.ts` y el arnés de workers de los tests.
 *
 * **Por omisión es la neutra** (punto decimal, coma de miles, `TRUE`/`FALSE`),
 * que es como calculaba el motor hasta ahora. Así ningún test ni ningún camino
 * que no sepa de esto cambia de comportamiento sin pedirlo.
 */

export interface ConfiguracionRegional {
  /** El separador decimal que usa Excel: `,` en español, `.` en inglés. */
  decimal: string;
  /** El separador de miles. Puede ser `.`, `,`, un espacio o un espacio duro. */
  miles: string;
  /** Cómo escribe Excel el lógico verdadero en este idioma. */
  verdadero: string;
  falso: string;
  /** El idioma, tal como lo da Office (`es-ES`). Informativo. */
  idioma: string;
}

export const REGIONAL_NEUTRA: ConfiguracionRegional = Object.freeze({
  decimal: '.',
  miles: ',',
  verdadero: 'TRUE',
  falso: 'FALSE',
  idioma: 'en-US',
});

let actual: ConfiguracionRegional = REGIONAL_NEUTRA;

/** La configuración con la que se está calculando ahora. */
export function regionalActual(): ConfiguracionRegional {
  return actual;
}

/**
 * Fija la configuración para las evaluaciones que vengan. Se llama una vez al
 * empezar una simulación (y en cada worker, antes de su primer bloque).
 *
 * Una configuración incoherente —el mismo carácter como decimal y como miles—
 * no se acepta: con ella no hay forma de leer un número, y es mejor enterarse
 * al fijarla que con un `#¡VALOR!` en mitad de la simulación.
 */
export function establecerRegional(c: ConfiguracionRegional): void {
  if (c.decimal === c.miles) {
    throw new Error(`Configuración regional incoherente: "${c.decimal}" no puede ser a la vez decimal y miles.`);
  }
  actual = c;
}

/** Vuelve a la neutra. Para los tests, y para dejar las cosas como estaban. */
export function restablecerRegional(): void {
  actual = REGIONAL_NEUTRA;
}

/**
 * Los nombres de los lógicos por idioma. Office da el separador decimal pero
 * **no** cómo se escribe VERDADERO en cada idioma, así que va en una tabla. Un
 * idioma que no esté aquí usa los nombres en inglés, que es lo que muestra un
 * Excel sin traducción de funciones.
 */
const LOGICOS: Record<string, [string, string]> = {
  es: ['VERDADERO', 'FALSO'],
  pt: ['VERDADEIRO', 'FALSO'],
  fr: ['VRAI', 'FAUX'],
  it: ['VERO', 'FALSO'],
  de: ['WAHR', 'FALSCH'],
  nl: ['WAAR', 'ONWAAR'],
  ca: ['CERT', 'FALS'],
  en: ['TRUE', 'FALSE'],
};

/**
 * Arma la configuración a partir de lo que dice Office: el idioma y, si los
 * da, los separadores. Si no los da, se deducen del idioma con la regla
 * general —coma decimal en casi toda Europa continental y Latinoamérica,
 * punto en el mundo anglosajón y en México—, que es una aproximación y por eso
 * se prefieren siempre los separadores que dé Excel.
 */
export function regionalDesdeIdioma(
  idioma: string,
  separadores?: { decimal?: string; miles?: string },
): ConfiguracionRegional {
  const base = idioma.toLowerCase();
  const lengua = base.split('-')[0] ?? 'en';
  const [verdadero, falso] = LOGICOS[lengua] ?? (LOGICOS.en as [string, string]);

  const conPunto = lengua === 'en' || base === 'es-mx' || base === 'es-us' || base === 'zh' || base === 'ja';
  const decimal = separadores?.decimal || (conPunto ? '.' : ',');
  let miles = separadores?.miles || (decimal === ',' ? '.' : ',');
  if (miles === decimal) miles = decimal === ',' ? '.' : ',';

  return { decimal, miles, verdadero, falso, idioma };
}
