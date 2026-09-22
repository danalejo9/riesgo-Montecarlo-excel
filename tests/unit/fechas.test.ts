import { describe, expect, it } from 'vitest';

import {
  DATE, DAY, DAYS, EDATE, EOMONTH, MONTH, WEEKDAY, YEAR,
  partesDeSerie, serieDePartes,
} from '../../engine/functions/fechas.ts';
import {
  FV, IPMT, IRR, NPER, NPV, PMT, PPMT, PV, RATE, XIRR, XNPV,
} from '../../engine/functions/financieras.ts';
import { argRango, argValor, type Argumento } from '../../engine/functions/types.ts';
import {
  errorEn, numeroConstante, tipoEn, ERROR, type Columna,
} from '../../engine/values/columna.ts';
import { nums } from '../helpers/valores.ts';

const c = (...v: number[]): Argumento => argValor(numeroConstante(v[0] as number, 1));
const rango = (...v: number[]): Argumento => argRango(v.map((x) => numeroConstante(x, 1)));

function errorDe(col: Columna): string | undefined {
  return tipoEn(col, 0) === ERROR ? errorEn(col, 0) : undefined;
}

// Números de serie verificados: 2024-01-01 es 45292 y 2024-02-29 es 45351.
const S_2024_01_01 = 45292;
const S_2024_01_31 = 45322;
const S_2024_02_29 = 45351;
const S_2024_03_31 = 45382;
const S_2025_01_01 = 45658;

describe('número de serie de Excel', () => {
  it('convierte ida y vuelta una fecha corriente', () => {
    expect(serieDePartes(2024, 1, 1)).toBe(S_2024_01_01);
    expect(partesDeSerie(S_2024_01_01)).toEqual({ anio: 2024, mes: 1, dia: 1 });
  });

  it('reproduce el error de 1900 que Excel heredó de Lotus', () => {
    // La serie 60 es el 29 de febrero de 1900, un día que no existió. El
    // salto de época entre el 59 y el 61 es justo lo que lo compensa.
    expect(partesDeSerie(59)).toEqual({ anio: 1900, mes: 2, dia: 28 });
    expect(partesDeSerie(60)).toEqual({ anio: 1900, mes: 2, dia: 29 });
    expect(partesDeSerie(61)).toEqual({ anio: 1900, mes: 3, dia: 1 });
    expect(serieDePartes(1900, 1, 1)).toBe(1);
    expect(serieDePartes(1900, 3, 1)).toBe(61);
  });

  it('una serie negativa es #¡NUM!', () => {
    expect(partesDeSerie(-1)).toBe('#NUM!');
  });
});

describe('AÑO, MES, DIA', () => {
  it('extraen las partes de una fecha', () => {
    expect(nums(YEAR([c(S_2024_02_29)], 1))).toEqual([2024]);
    expect(nums(MONTH([c(S_2024_02_29)], 1))).toEqual([2]);
    expect(nums(DAY([c(S_2024_02_29)], 1))).toEqual([29]);
  });

  it('ignoran la parte decimal, que es la hora', () => {
    expect(nums(DAY([c(S_2024_02_29 + 0.75)], 1))).toEqual([29]);
  });
});

describe('FECHA', () => {
  it('construye la serie a partir de año, mes y día', () => {
    expect(nums(DATE([c(2024), c(1), c(1)], 1))).toEqual([S_2024_01_01]);
  });

  it('normaliza meses y días fuera de rango, como Excel', () => {
    expect(nums(DATE([c(2024), c(13), c(1)], 1))).toEqual([S_2025_01_01]);
    expect(nums(DATE([c(2024), c(3), c(0)], 1))).toEqual([S_2024_02_29]); // día 0 = fin del mes anterior
  });

  it('un año entre 0 y 1899 se interpreta como 1900 + año', () => {
    // Ojo: FECHA(24;1;1) es 1924, no 2024. Es una fuente de errores clásica en
    // hojas reales, y el motor tiene que reproducirla, no corregirla.
    expect(nums(DATE([c(24), c(1), c(1)], 1))).toEqual([serieDePartes(1924, 1, 1)]);
  });
});

describe('FIN.MES', () => {
  it('da el último día del mes, sin casos especiales por longitud', () => {
    expect(nums(EOMONTH([c(S_2024_01_01), c(0)], 1))).toEqual([S_2024_01_31]);
    expect(nums(EOMONTH([c(S_2024_01_01), c(1)], 1))).toEqual([S_2024_02_29]); // bisiesto
    expect(nums(EOMONTH([c(S_2024_01_01), c(2)], 1))).toEqual([S_2024_03_31]);
  });

  it('acepta un desplazamiento negativo', () => {
    expect(nums(EOMONTH([c(S_2024_02_29), c(-1)], 1))).toEqual([S_2024_01_31]);
  });
});

describe('FECHA.MES', () => {
  it('mantiene el día cuando el mes de destino lo permite', () => {
    expect(nums(EDATE([c(S_2024_01_01), c(1)], 1))).toEqual([serieDePartes(2024, 2, 1)]);
  });

  it('recorta al último día cuando el mes de destino es más corto', () => {
    // El 31 de enero más un mes es el 29 de febrero en un año bisiesto, no el
    // 2 de marzo, que es lo que saldría de sumar sin recortar.
    expect(nums(EDATE([c(S_2024_01_31), c(1)], 1))).toEqual([S_2024_02_29]);
  });
});

describe('DIAS y DIASEM', () => {
  it('DIAS resta con el fin primero', () => {
    expect(nums(DAYS([c(S_2024_02_29), c(S_2024_01_01)], 1))).toEqual([59]);
  });

  it('DIASEM numera según el tipo pedido', () => {
    // El 1 de enero de 2024 fue lunes.
    expect(nums(WEEKDAY([c(S_2024_01_01)], 1))).toEqual([2]); // tipo 1: domingo = 1
    expect(nums(WEEKDAY([c(S_2024_01_01), c(2)], 1))).toEqual([1]); // tipo 2: lunes = 1
    expect(nums(WEEKDAY([c(S_2024_01_01), c(3)], 1))).toEqual([0]); // tipo 3: lunes = 0
  });

  it('un tipo desconocido es #¡NUM!', () => {
    expect(errorDe(WEEKDAY([c(S_2024_01_01), c(9)], 1))).toBe('#NUM!');
  });
});

describe('VNA', () => {
  it('descuenta desde el primer periodo, no desde el momento cero', () => {
    // 100/1,1 + 200/1,21
    expect(nums(NPV([c(0.1), rango(100, 200)], 1))[0]).toBeCloseTo(256.19834710743805, 8);
  });

  it('ignora lo que no sea número, sin que ocupe periodo', () => {
    const conHueco = argRango([
      numeroConstante(100, 1),
      { forma: 'constante', n: 1, valor: { tipo: 3 } } as Columna, // vacía
      numeroConstante(200, 1),
    ]);
    expect(nums(NPV([c(0.1), conHueco], 1))[0]).toBeCloseTo(256.19834710743805, 8);
  });
});

describe('TIR', () => {
  it('encuentra la tasa de un flujo con un solo cambio de signo', () => {
    expect(nums(IRR([rango(-100, 60, 60)], 1))[0]).toBeCloseTo(0.1306623862918075, 8);
    expect(nums(IRR([rango(-1000, 300, 420, 680)], 1))[0]).toBeCloseTo(0.16340560068898935, 8);
  });

  it('respeta la estimación inicial y llega al mismo sitio', () => {
    expect(nums(IRR([rango(-1000, 300, 420, 680), c(0.5)], 1))[0])
      .toBeCloseTo(0.16340560068898935, 8);
  });

  it('sin cambio de signo no hay tasa: #¡NUM!', () => {
    expect(errorDe(IRR([rango(100, 200, 300)], 1))).toBe('#NUM!');
    expect(errorDe(IRR([rango(-100, -200)], 1))).toBe('#NUM!');
  });

  it('la tasa encontrada anula de verdad el valor actual neto', () => {
    // Comprobación independiente de la implementación: se recalcula el VAN
    // con la tasa devuelta y tiene que dar cero.
    const flujos = [-500, 100, 150, 200, 250];
    const r = nums(IRR([rango(...flujos)], 1))[0] as number;
    const van = flujos.reduce((acc, v, k) => acc + v / (1 + r) ** k, 0);
    expect(van).toBeCloseTo(0, 6);
  });
});

describe('amortización: PAGO, VA, VF, NPER, TASA', () => {
  // Referencias calculadas fuera del motor con la ecuación del valor temporal
  // del dinero, para no comprobar el código contra sí mismo.
  const PAGO_HIPOTECA = -1073.6432460242795; // 200.000 al 5 % anual, 30 años

  it('PAGO devuelve un número negativo: es dinero que sale', () => {
    expect(nums(PMT([c(0.05 / 12), c(360), c(200000)], 1))[0])
      .toBeCloseTo(PAGO_HIPOTECA, 8);
  });

  it('PAGO sin intereses reparte el capital en partes iguales', () => {
    // El caso tasa = 0 hace cero el denominador de la fórmula general; se
    // resuelve con el límite lineal, no con un caso especial inventado.
    expect(nums(PMT([c(0), c(12), c(1200)], 1))).toEqual([-100]);
  });

  it('VF y VA son coherentes entre sí', () => {
    expect(nums(FV([c(0.06), c(10), c(-1000)], 1))[0]).toBeCloseTo(13180.79494238091, 6);
    expect(nums(PV([c(0.08), c(5), c(-2000)], 1))[0]).toBeCloseTo(7985.420074156177, 6);
  });

  it('NPER recupera el plazo a partir de la cuota', () => {
    // Cierra el círculo: con la cuota que devolvió PAGO, NPER da los 360 meses.
    expect(nums(NPER([c(0.05 / 12), c(PAGO_HIPOTECA), c(200000)], 1))[0])
      .toBeCloseTo(360, 6);
  });

  it('TASA recupera el interés a partir de la cuota', () => {
    expect(nums(RATE([c(360), c(PAGO_HIPOTECA), c(200000)], 1))[0])
      .toBeCloseTo(0.05 / 12, 8);
  });

  it('PAGOINT y PAGOPRIN suman la cuota completa', () => {
    const interes = nums(IPMT([c(0.05 / 12), c(1), c(360), c(200000)], 1))[0] as number;
    const capital = nums(PPMT([c(0.05 / 12), c(1), c(360), c(200000)], 1))[0] as number;

    expect(interes).toBeCloseTo(200000 * (0.05 / 12), 8);
    expect(interes + capital).toBeCloseTo(PAGO_HIPOTECA, 8);
  });

  it('un periodo fuera del plazo es #¡NUM!', () => {
    expect(errorDe(IPMT([c(0.05), c(0), c(12), c(1000)], 1))).toBe('#NUM!');
    expect(errorDe(PPMT([c(0.05), c(13), c(12), c(1000)], 1))).toBe('#NUM!');
  });
});

describe('flujos con fechas: VNA.NO.PER y TIR.NO.PER', () => {
  // 1 de enero de 2024, 1 de julio de 2024 y 1 de enero de 2025.
  const FECHAS = rango(45292, 45474, 45658);
  const FLUJOS = rango(-10000, 6000, 6000);

  it('VNA.NO.PER descuenta por días reales entre 365', () => {
    expect(nums(XNPV([c(0.1), FLUJOS, FECHAS], 1))[0]).toBeCloseTo(1174.6438284632468, 6);
  });

  it('TIR.NO.PER encuentra la tasa que anula el valor actual', () => {
    const r = nums(XIRR([FLUJOS, FECHAS], 1))[0] as number;
    expect(r).toBeCloseTo(0.278158944317214, 6);

    // Comprobación independiente: con esa tasa, el valor actual es cero.
    expect(nums(XNPV([c(r), FLUJOS, FECHAS], 1))[0]).toBeCloseTo(0, 6);
  });

  it('sin cambio de signo no hay tasa', () => {
    expect(errorDe(XIRR([rango(100, 200, 300), FECHAS], 1))).toBe('#NUM!');
  });

  it('si las listas no miden lo mismo, #¡NUM!', () => {
    expect(errorDe(XNPV([c(0.1), rango(-100, 50), FECHAS], 1))).toBe('#NUM!');
  });
});
