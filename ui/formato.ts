/**
 * Cómo se enseñan los números del informe.
 *
 * Está aparte de los componentes porque es la parte que se puede probar, y
 * porque las reglas son de producto: un resultado de riesgo se lee de un
 * vistazo o no se lee. `toLocaleString` a secas no basta — con 3.020.927,6712
 * el panel se descuadra, y con 0,000034 redondear a dos decimales enseña un
 * cero que no es cierto.
 */

/**
 * Un número para leer, no para copiar.
 *
 * Las reglas, en orden: cero es cero; lo que no es finito se dice con
 * palabras, porque `NaN` en un informe no significa nada para quien lo lee;
 * lo muy grande y lo muy pequeño van en notación científica; y el resto lleva
 * los decimales que hagan falta para distinguir dos valores parecidos, no un
 * número fijo. Cinco cifras significativas es lo que cabe en el panel.
 */
export function numero(n: number, significativas = 5): string {
  if (n === 0) return '0';
  if (Number.isNaN(n)) return 'sin datos';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞';

  const magnitud = Math.abs(n);
  if (magnitud >= 1e12 || magnitud < 1e-4) {
    return n.toExponential(Math.max(0, significativas - 1)).replace('.', ',');
  }

  // Decimales según la magnitud: 1234,6 pero 0,001235. Lo que manda es la
  // primera cifra que no es cero, no la coma: con 0,00123 los tres ceros de
  // delante no son información, y contarlos como dígitos dejaría el número en
  // 0,00 — que es exactamente el redondeo que hay que evitar.
  const enteros = Math.floor(Math.log10(magnitud)) + 1;
  const decimales = Math.min(6, Math.max(0, significativas - enteros));
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

/** Un contador: iteraciones, celdas, fórmulas. Siempre entero y con puntos. */
export function miles(n: number): string {
  return Math.round(n).toLocaleString('es-ES');
}

/**
 * Una duración medida. Siempre con una unidad que el usuario pueda sentir:
 * nadie sabe cuánto son 187.432 ms.
 */
export function duracion(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;

  const segundos = ms / 1000;
  if (segundos < 60) return `${segundos.toFixed(segundos < 10 ? 1 : 0).replace('.', ',')} s`;

  const minutos = Math.floor(segundos / 60);
  const resto = Math.round(segundos % 60);
  if (minutos < 60) return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return minutosRestantes === 0 ? `${horas} h` : `${horas} h ${minutosRestantes} min`;
}

/** Un porcentaje de avance, para la barra de progreso. */
export function porcentaje(hechas: number, totales: number): number {
  if (!(totales > 0)) return 0;
  return Math.min(100, Math.max(0, (hechas / totales) * 100));
}

/**
 * Lee un número escrito por el usuario: "0", "-1.500.000", "2,5", "71.153".
 *
 * Con coma decimal (español, lo predeterminado), un punto que agrupa de tres
 * en tres es de miles —"71.153" es setenta y un mil, como lo escribe el panel—
 * y solo un punto que no agrupa bien ("2.5") se toma por decimal. Con punto
 * decimal, las comas son de miles. `null` si no es un número.
 */
export function leerNumero(texto: string, decimal: string = ','): number | null {
  let t = texto.trim().replace(/\s/g, '').replace('\u2212', '-');
  if (t === '' || t === '-') return null;
  if (decimal === ',') {
    const partes = t.split(',');
    if (partes.length > 2) return null;
    const [entera = '', fraccion] = partes;
    const miles = /^-?\d{1,3}(\.\d{3})+$/.test(entera);
    if (fraccion !== undefined || miles) t = `${entera.replace(/\./g, '')}${fraccion !== undefined ? `.${fraccion}` : ''}`;
  } else {
    t = t.replace(/,/g, '');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
