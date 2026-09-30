/**
 * La moneda (decisión 23): el mercado es hispanohablante y los precios van
 * en USD por ahora, pero la moneda tiene que poder cambiarse sin tocar el
 * código. Aquí está la tabla y el formato de Excel de cada una; las
 * plantillas y el cronograma la piden por su código.
 *
 * Los costos del modelo del usuario no pasan por aquí: toman el formato de
 * su propia celda.
 */

export interface Moneda {
  codigo: string;
  nombre: string;
  simbolo: string;
  /** Decimales que se enseñan. */
  decimales: number;
  /** El símbolo va después de la cifra (`1.000 €`). */
  simboloDetras: boolean;
}

export const MONEDAS: Readonly<Record<string, Moneda>> = {
  USD: { codigo: 'USD', nombre: 'Dólar estadounidense', simbolo: 'US$', decimales: 0, simboloDetras: false },
  EUR: { codigo: 'EUR', nombre: 'Euro', simbolo: '€', decimales: 0, simboloDetras: true },
  COP: { codigo: 'COP', nombre: 'Peso colombiano', simbolo: 'COP$', decimales: 0, simboloDetras: false },
  MXN: { codigo: 'MXN', nombre: 'Peso mexicano', simbolo: 'MX$', decimales: 0, simboloDetras: false },
  ARS: { codigo: 'ARS', nombre: 'Peso argentino', simbolo: 'AR$', decimales: 0, simboloDetras: false },
  CLP: { codigo: 'CLP', nombre: 'Peso chileno', simbolo: 'CLP$', decimales: 0, simboloDetras: false },
  PEN: { codigo: 'PEN', nombre: 'Sol peruano', simbolo: 'S/', decimales: 0, simboloDetras: false },
};

export const MONEDA_POR_DEFECTO = 'USD';

export function moneda(codigo: string = MONEDA_POR_DEFECTO): Moneda {
  return MONEDAS[codigo.toUpperCase()] ?? (MONEDAS[MONEDA_POR_DEFECTO] as Moneda);
}

/** Código de formato de Excel (invariante, en-US) para una moneda. */
export function formatoMoneda(codigo: string = MONEDA_POR_DEFECTO): string {
  const m = moneda(codigo);
  const cifra = m.decimales > 0 ? `#,##0.${'0'.repeat(m.decimales)}` : '#,##0';
  const simbolo = `"${m.simbolo}"`;
  return m.simboloDetras ? `${cifra} ${simbolo}` : `${simbolo} ${cifra}`;
}
