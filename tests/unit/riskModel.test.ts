import { describe, expect, it } from 'vitest';
import { esDefinidaPositiva } from '../../engine/sampling/correlate.ts';

import {
  agruparCorrelaciones,
  generarId,
  prepararEntradas,
  validarRiskModel,
  VERSION_ESQUEMA_RISK_MODEL,
  type EntradaRiskModel,
  type ModeloRiesgo,
} from '../../engine/modelo/index.ts';

function modeloBase(): ModeloRiesgo {
  return {
    schema: 1,
    inputs: [
      {
        id: 'in_acero',
        name: 'Precio acero',
        ref: 'RM_in_acero',
        dist: { type: 'pert', min: 800, mode: 950, max: 1400 },
        correlations: [],
      },
    ],
    outputs: [{ id: 'out_total', name: 'Coste total', ref: 'RM_out_total' }],
    settings: { iterations: 10_000, seed: 20260915, sampling: 'lhs', engine: 'auto' },
  };
}

describe('generarId', () => {
  it('usa el prefijo pedido y no colisiona en un lote razonable', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generarId('in')));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id.startsWith('in_')).toBe(true);
  });
});

describe('validarRiskModel', () => {
  it('acepta y conserva la configuración de precisión', () => {
    const m = modeloBase();
    const conv = { target: 0.02, untilConverged: true, maxIterations: 500_000 };
    const r = validarRiskModel({ ...m, settings: { ...m.settings, convergence: conv } });
    expect(r.ok && r.modelo.settings.convergence).toEqual(conv);
  });

  it('rechaza una precisión imposible con su motivo', () => {
    const m = modeloBase();
    const r = validarRiskModel({ ...m, settings: { ...m.settings, convergence: { target: 2, untilConverged: true, maxIterations: 10 } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toContain('convergence');
  });

  it('acepta un modelo bien formado', () => {
    const r = validarRiskModel(modeloBase());
    expect(r.ok).toBe(true);
  });

  it('rechaza un esquema más nuevo que el complemento y pide actualizarlo (H8)', () => {
    const m = { ...modeloBase(), schema: 2 };
    const r = validarRiskModel(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toMatch(/versión más nueva/i);
    expect(validarRiskModel({ ...modeloBase(), schema: 'x' }).ok).toBe(false);
  });

  it('rechaza algo que no es un objeto', () => {
    expect(validarRiskModel(null).ok).toBe(false);
    expect(validarRiskModel('hola').ok).toBe(false);
    expect(validarRiskModel(42).ok).toBe(false);
  });

  it('rechaza ids y refs repetidos entre entradas y salidas', () => {
    const m = modeloBase();
    m.outputs.push({ id: 'in_acero', name: 'Otra cosa', ref: 'RM_otro' });
    const r = validarRiskModel(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.some((e) => e.includes('in_acero'))).toBe(true);
  });

  it('reutiliza la validación semántica de la distribución (no la duplica)', () => {
    const m = modeloBase();
    (m.inputs[0] as EntradaRiskModel).dist = { type: 'pert', min: 10, mode: 5, max: 20 }; // moda fuera de rango
    const r = validarRiskModel(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.some((e) => e.includes('PERT'))).toBe(true);
  });

  it('rechaza una correlación hacia una entrada inexistente o hacia sí misma', () => {
    const m = modeloBase();
    (m.inputs[0] as EntradaRiskModel).correlations = [{ with: 'in_acero', coefficient: 0.5 }];
    let r = validarRiskModel(m);
    expect(r.ok).toBe(false);

    (m.inputs[0] as EntradaRiskModel).correlations = [{ with: 'in_fantasma', coefficient: 0.5 }];
    r = validarRiskModel(m);
    expect(r.ok).toBe(false);
  });

  it('rechaza settings inválidos uno por uno', () => {
    expect(validarRiskModel({ ...modeloBase(), settings: { iterations: 0, seed: 1, sampling: 'lhs', engine: 'auto' } }).ok).toBe(false);
    expect(validarRiskModel({ ...modeloBase(), settings: { iterations: 100, seed: 1, sampling: 'raro', engine: 'auto' } }).ok).toBe(false);
    expect(validarRiskModel({ ...modeloBase(), settings: { iterations: 100, seed: 1, sampling: 'lhs', engine: 'raro' } }).ok).toBe(false);
  });
});

describe('agruparCorrelaciones', () => {
  function entrada(id: string, correlations: { with: string; coefficient: number }[] = []): EntradaRiskModel {
    return { id, name: id, ref: `RM_${id}`, dist: { type: 'uniform', min: 0, max: 1 }, correlations };
  }

  it('sin correlaciones declaradas, no hay grupos', () => {
    const r = agruparCorrelaciones([entrada('a'), entrada('b')]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.grupos).toEqual([]);
  });

  it('agrupa un par correlacionado con matriz simétrica y diagonal 1', () => {
    const a = entrada('a', [{ with: 'b', coefficient: 0.6 }]);
    const b = entrada('b');
    const r = agruparCorrelaciones([a, b]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grupos.length).toBe(1);
    const [grupo] = r.grupos;
    expect(grupo?.ids.sort()).toEqual(['a', 'b']);
    const ia = grupo?.ids.indexOf('a') as number;
    const ib = grupo?.ids.indexOf('b') as number;
    expect(grupo?.matriz[ia]?.[ia]).toBe(1);
    expect(grupo?.matriz[ia]?.[ib]).toBe(0.6);
    expect(grupo?.matriz[ib]?.[ia]).toBe(0.6);
  });

  it('encadena en un solo grupo a-b-c aunque a y c no se declaren directamente', () => {
    const a = entrada('a', [{ with: 'b', coefficient: 0.5 }]);
    const b = entrada('b', [{ with: 'c', coefficient: 0.3 }]);
    const c = entrada('c');
    const d = entrada('d'); // independiente, no debe aparecer en ningún grupo
    const r = agruparCorrelaciones([a, b, c, d]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grupos.length).toBe(1);
    expect(r.grupos[0]?.ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('detecta una declaración contradictoria entre el mismo par', () => {
    const a = entrada('a', [{ with: 'b', coefficient: 0.5 }]);
    const b = entrada('b', [{ with: 'a', coefficient: 0.9 }]); // mismo par, valor distinto
    const r = agruparCorrelaciones([a, b]);
    expect(r.ok).toBe(false);
  });

  it('una declaración simétrica consistente (a dice b, b dice a, mismo valor) no es un error', () => {
    const a = entrada('a', [{ with: 'b', coefficient: 0.7 }]);
    const b = entrada('b', [{ with: 'a', coefficient: 0.7 }]);
    const r = agruparCorrelaciones([a, b]);
    expect(r.ok).toBe(true);
  });

  it('una matriz imposible se corrige a la posible más cercana (Higham) y avisa nombrando a los implicados', () => {
    // "A va con B, B va con C, y A va al revés que C" no describe ninguna
    // realidad. Antes se rechazaba; ahora se usa la matriz posible más
    // cercana, como en el análisis de cronograma, y se dice cuánto cambió.
    const a = entrada('a', [{ with: 'b', coefficient: 0.9 }, { with: 'c', coefficient: -0.9 }]);
    const b = entrada('b', [{ with: 'c', coefficient: 0.9 }]);
    const c = entrada('c');

    const r = agruparCorrelaciones([a, b, c]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajustes).toHaveLength(1);
    const aj = r.ajustes[0]!;
    expect(aj.aviso).toContain('"a"');
    expect(aj.aviso).toContain('contradictorias');
    expect(aj.pares).toHaveLength(3);
    // La matriz que se usa sí es posible, y se aleja de lo pedido.
    expect(esDefinidaPositiva(r.grupos[0]!.matriz)).toBe(true);
    expect(aj.cambioMaximo).toBeGreaterThan(0.1);
    for (const p of aj.pares) expect(Math.sign(p.usada)).toBe(Math.sign(p.pedida));
  });

  it('una correlación fuerte pero posible entre tres sí se acepta', () => {
    const a = entrada('a', [{ with: 'b', coefficient: 0.9 }, { with: 'c', coefficient: 0.8 }]);
    const b = entrada('b', [{ with: 'c', coefficient: 0.85 }]);
    const r = agruparCorrelaciones([a, b, entrada('c')]);
    expect(r.ok).toBe(true);
  });

  it('el límite: dos variables idénticas (r = 1) dan una matriz singular, que se corrige a casi 1', () => {
    // Un coeficiente de exactamente 1 dice "son la misma variable", y entonces
    // la matriz es singular; Iman–Conover no puede con ella. Se usa la más
    // cercana posible (un poco menos de 1) y se avisa.
    const a = entrada('a', [{ with: 'b', coefficient: 1 }]);
    const r = agruparCorrelaciones([a, entrada('b')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajustes).toHaveLength(1);
    const usada = r.ajustes[0]!.pares[0]!.usada;
    expect(usada).toBeGreaterThan(0.999);
    expect(usada).toBeLessThan(1);
  });
});

describe('prepararEntradas', () => {
  it('el flujo aleatorio va ligado a la celda: volver a marcarla (id nuevo) da los mismos números', () => {
    const resolver = (ref: string) => `Hoja1!${ref}`;
    const a = modeloBase();
    const b = modeloBase();
    (b.inputs[0] as EntradaRiskModel).id = 'in_otro_id_generado';
    (b.inputs[0] as EntradaRiskModel).name = 'Otro nombre';
    for (const sampling of ['monte-carlo', 'lhs'] as const) {
      a.settings.sampling = sampling;
      b.settings.sampling = sampling;
      const ra = prepararEntradas(a, resolver, 7);
      const rb = prepararEntradas(b, resolver, 7);
      expect(ra).toEqual(rb);
    }
  });

  it('una entrada sin correlación se deja perezosa (distribucion), no materializada', () => {
    const modelo = modeloBase();
    const r = prepararEntradas(modelo, (ref) => `Hoja1!${ref}`, 42);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entradas).toHaveLength(1);
    expect(r.entradas[0]?.tipo).toBe('distribucion');
    expect(r.entradas[0]?.clave).toBe('Hoja1!RM_in_acero');
  });

  it('un grupo correlacionado se materializa como buffer, ya correlacionado', () => {
    const modelo: ModeloRiesgo = {
      schema: 1,
      inputs: [
        { id: 'acero', name: 'Acero', ref: 'RM_acero', dist: { type: 'normal', mean: 800, stdDev: 50 }, correlations: [{ with: 'cemento', coefficient: 0.8 }] },
        { id: 'cemento', name: 'Cemento', ref: 'RM_cemento', dist: { type: 'normal', mean: 300, stdDev: 20 }, correlations: [] },
      ],
      outputs: [],
      settings: { iterations: 50_000, seed: 42, sampling: 'monte-carlo', engine: 'auto' },
    };

    const r = prepararEntradas(modelo, (ref) => ref, 42);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entradas).toHaveLength(2);
    for (const def of r.entradas) {
      expect(def.tipo).toBe('buffer');
      if (def.tipo === 'buffer') expect(def.buffer.length).toBe(50_000);
    }
  });

  it('propaga los errores de una correlación contradictoria', () => {
    const modelo: ModeloRiesgo = {
      schema: 1,
      inputs: [
        { id: 'a', name: 'a', ref: 'RM_a', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [{ with: 'b', coefficient: 0.5 }] },
        { id: 'b', name: 'b', ref: 'RM_b', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [{ with: 'a', coefficient: -0.5 }] },
      ],
      outputs: [],
      settings: { iterations: 1000, seed: 1, sampling: 'monte-carlo', engine: 'auto' },
    };
    const r = prepararEntradas(modelo, (ref) => ref, 1);
    expect(r.ok).toBe(false);
  });
});

it('la versión de esquema exportada coincide con la que exige el validador', () => {
  expect(VERSION_ESQUEMA_RISK_MODEL).toBe(1);
});
