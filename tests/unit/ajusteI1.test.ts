import { describe, expect, it } from 'vitest';

import { ajustarDistribuciones, gammaFormaMLE, ordenarCandidatos } from '../../engine/modelo/ajuste.ts';

// Datos deterministas: cuantiles de una gamma(3, 10) aproximados por una lognormal.
const positivos = Array.from({ length: 60 }, (_, i) => 30 * Math.exp(0.5 * Math.sin(i * 1.3) + 0.01 * i));

describe('I1: ajuste explicado', () => {
  it('la gamma por máxima verosimilitud cumple ln k − ψ(k) = s', () => {
    for (const s of [0.01, 0.1, 0.5, 2]) {
      const k = gammaFormaMLE(s);
      // Comprobación numérica: derivada de ln Γ por diferencias.
      const h = 1e-5;
      const lg = (x: number) => { let r = 0; let y = x; while (y < 20) { r -= Math.log(y); y++; } return r + (y - 0.5) * Math.log(y) - y + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * y); };
      const psi = (lg(k + h) - lg(k - h)) / (2 * h);
      expect(Math.log(k) - psi).toBeCloseTo(s, 4);
    }
  });

  it('AICc y Cramér–von Mises para cada candidata; por defecto se ordena por AICc', () => {
    const r = ajustarDistribuciones(positivos)!;
    for (const c of r.candidatos) {
      expect(c.aicc).toBeGreaterThan(c.aic);
      expect(c.cramerVonMises).toBeGreaterThan(0);
    }
    const aicc = r.candidatos.map((c) => c.aicc);
    expect([...aicc].sort((a, b) => a - b)).toEqual(aicc);
    expect(ordenarCandidatos(r.candidatos, 'cramerVonMises')[0]!.cramerVonMises).toBe(Math.min(...r.candidatos.map((c) => c.cramerVonMises)));
  });

  it('el diagnóstico explica qué se descarta y por qué', () => {
    const conNegativos = ajustarDistribuciones([-3, -1, 0, 2, 4, 5, 7, 9, 10, 12])!;
    expect(conNegativos.diagnostico?.negativos).toBe(2);
    expect(conNegativos.diagnostico?.notas.join(' ')).toMatch(/se descartan la lognormal, la gamma y la Weibull/);
    expect(conNegativos.candidatos.map((c) => c.spec.type)).not.toContain('lognormal');

    const enteros = ajustarDistribuciones([1, 2, 2, 3, 3, 3, 4, 4, 5, 7])!;
    expect(enteros.diagnostico?.todosEnteros).toBe(true);
    expect(enteros.diagnostico?.notas.join(' ')).toMatch(/enteros/);
  });

  it('la empírica son los datos tal cual, con cuántas veces aparece cada valor', () => {
    const r = ajustarDistribuciones([1, 2, 2, 3, 3, 3])!;
    expect(r.empirica).toEqual({ type: 'discrete', values: [1, 2, 3], weights: [1, 2, 3] });
  });

  it('RIESGO.EMPIRICA: los datos tal cual desde la celda', async () => {
    const { leerFuncionRiesgo } = await import('../../engine/modelo/index.ts');
    const r = leerFuncionRiesgo('RIESGO.EMPIRICA({1;2;2;5})');
    expect(r).toMatchObject({ ok: true, media: 2.5, spec: { type: 'discrete', values: [1, 2, 5], weights: [1, 2, 1] } });
  });
});
