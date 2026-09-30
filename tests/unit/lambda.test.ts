/**
 * F1: `LAMBDA` (en la celda, en `LET` y con nombre) y los nombres definidos,
 * resueltos al parsear (`engine/parser/let.ts`). Los valores esperados de
 * Peng-Robinson son los de `tests/fixtures/generar-lambda.py`, calculados en
 * Python sin Excel (`python3 tests/fixtures/generar-lambda.py --casos`).
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { elegirMotor } from '../../engine/modelo/eleccionMotor.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { leerNombresDefinidos, parsear, type DefinicionNombre } from '../../engine/parser/index.ts';
import { errorEn, numeroEn, tipoEn, ERROR, NUMERO, type Columna } from '../../engine/values/columna.ts';

const H = 'Fidelidad';

/** Idénticos a NOMBRES en el generador. */
const NOMBRES: Record<string, string> = {
  R_GAS: '0.08314462618',
  TC_CO2: 'Fidelidad!$I$2',
  PC_CO2: 'Fidelidad!$I$3',
  W_CO2: 'Fidelidad!$I$4',
  PR_KAPPA: 'LAMBDA(w,0.37464+1.54226*w-0.26992*w^2)',
  PR_ALFA: 'LAMBDA(T,Tc,w,(1+PR_KAPPA(w)*(1-SQRT(T/Tc)))^2)',
  PR_A: 'LAMBDA(Tc,Pc,0.45724*R_GAS^2*Tc^2/Pc)',
  PR_B: 'LAMBDA(Tc,Pc,0.0778*R_GAS*Tc/Pc)',
  PR_P: 'LAMBDA(T,v,Tc,Pc,w,LET(a,PR_A(Tc,Pc),b,PR_B(Tc,Pc),R_GAS*T/(v-b)-a*PR_ALFA(T,Tc,w)/(v^2+2*b*v-b^2)))',
  PR_Z: 'LAMBDA(T,v,Tc,Pc,w,PR_P(T,v,Tc,Pc,w)*v/(R_GAS*T))',
  FACTREC: 'LAMBDA(n,IF(n<=1,1,n*FACTREC(n-1)))',
};
/** Idénticos a AUXILIARES en el generador: CO2 a 310 K y 0,5 L/mol. */
const AUXILIARES: Record<string, string> = { H2: '310', H3: '0.5', I2: '304.13', I3: '73.77', I4: '0.2239' };

const PR_LET = 'LET(R,0.08314462618,Tc,I2,Pc,I3,w,I4,kappa,LAMBDA(w,0.37464+1.54226*w-0.26992*w^2),'
  + 'alfa,LAMBDA(T,(1+kappa(w)*(1-SQRT(T/Tc)))^2),a,0.45724*R^2*Tc^2/Pc,b,0.0778*R*Tc/Pc,'
  + 'R*H2/(H3-b)-a*alfa(H2)/(H3^2+2*b*H3-b^2))';
const PR_INLINE = 'LAMBDA(T,v,LET(R,0.08314462618,Tc,I2,Pc,I3,w,I4,kappa,0.37464+1.54226*w-0.26992*w^2,'
  + 'a,0.45724*R^2*Tc^2/Pc,b,0.0778*R*Tc/Pc,R*T/(v-b)-a*(1+kappa*(1-SQRT(T/Tc)))^2/(v^2+2*b*v-b^2)))(350,0.3)';

/** Los casos numéricos del generador, con el valor que da Python. */
const CASOS: Array<[string, string, number]> = [
  ['L-001', 'LAMBDA(x,x^2+1)(3)', 10],
  ['L-002', 'LAMBDA(a,b,a*b-a)(4,5)', 16],
  ['L-003', 'LET(f,LAMBDA(x,2*x),f(7)+f(1))', 16],
  ['L-004', 'LET(k,10,g,LAMBDA(x,x+k),g(5))', 15],
  ['L-005', 'LAMBDA(x,y,x/y)(H2,H3)', 620],
  ['L-006', 'LET(x,1,LAMBDA(x,x*100)(2))', 200],
  ['L-007', 'R_GAS*1000', 83.14462618],
  ['L-008', 'TC_CO2/PC_CO2', 4.122678595635082],
  ['L-009', 'PR_KAPPA(W_CO2)', 0.7064205977968],
  ['L-010', 'PR_ALFA(H2,TC_CO2,W_CO2)', 0.9864766017268967],
  ['L-011', 'PR_A(TC_CO2,PC_CO2)', 3.9632487071288502],
  ['L-012', 'PR_B(TC_CO2,PC_CO2)', 0.026668172800021695],
  ['L-013', 'PR_P(H2,H3,TC_CO2,PC_CO2,W_CO2)', 40.286433714802136],
  ['L-014', 'PR_Z(H2,H3,TC_CO2,PC_CO2,W_CO2)', 0.7815071385872957],
  ['L-015', PR_LET, 40.286433714802136],
  ['L-016', PR_INLINE, 72.59515194727734],
  ['L-017', 'PR_P(H2,H3,TC_CO2,PC_CO2,W_CO2)-R_GAS*H2/H3', -11.263234516797866],
  ['L-018', 'ROUND(PR_P(H2,H3,I2,I3,I4),2)', 40.29],
  ['L-019', 'SUM(LAMBDA(r,r*2)(I2:I4))', 756.2478],
];

const definiciones = (extra: DefinicionNombre[] = []): DefinicionNombre[] =>
  [...Object.entries(NOMBRES).map(([nombre, formula]) => ({ nombre, formula })), ...extra];

function evaluar(formula: string, extra: DefinicionNombre[] = []): Columna {
  const celdas: FormulaCelda[] = [{ hoja: H, col: 5, fila: 2, formula }];
  for (const [ref, valor] of Object.entries(AUXILIARES)) {
    celdas.push({ hoja: H, col: ref.charCodeAt(0) - 64, fila: Number(ref.slice(1)), formula: valor });
  }
  const { grafo } = construirGrafo(celdas, [], leerNombresDefinidos(definiciones(extra)));
  const clave = claveDeReferencia(H, 'E2');
  const r = evaluarModelo(grafo, new Map(), [clave], 1);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.valores.get(clave) as Columna;
}

const ast = (formula: string) => {
  const r = parsear(formula, leerNombresDefinidos(definiciones()).libro);
  if (!r.ok) throw new Error(r.error.mensaje);
  return r.ast;
};

describe('Peng-Robinson con LAMBDA, contra Python', () => {
  for (const [id, formula, esperado] of CASOS) {
    it(`${id}: ${formula.length > 60 ? `${formula.slice(0, 60)}…` : formula}`, () => {
      const c = evaluar(formula);
      expect(tipoEn(c, 0)).toBe(NUMERO);
      expect(numeroEn(c, 0)).toBeCloseTo(esperado, 10);
    });
  }

  it('las tres formas dan la misma presión', () => {
    const conNombre = numeroEn(evaluar('PR_P(H2,H3,I2,I3,I4)'), 0);
    expect(numeroEn(evaluar(PR_LET), 0)).toBeCloseTo(conNombre, 12);
    expect(numeroEn(evaluar(PR_INLINE.replace('(350,0.3)', '(H2,H3)')), 0)).toBeCloseTo(conNombre, 12);
  });

  it('como las guarda el .xlsx: _xlfn.LAMBDA y _xlpm.', () => {
    const c = evaluar('_xlfn.LET(_xlpm.f,_xlfn.LAMBDA(_xlpm.x,_xlpm.y,_xlpm.x*_xlpm.y),_xlpm.f(3,4))+_xlfn.LAMBDA(_xlpm.x,_xlpm.x)(1)');
    expect(numeroEn(c, 0)).toBe(13);
  });
});

describe('lo que Excel da como error', () => {
  it('faltan o sobran argumentos: #¡VALOR!', () => {
    for (const f of ['PR_KAPPA()', 'LAMBDA(x,x)(1,2)']) {
      const c = evaluar(f);
      expect(tipoEn(c, 0)).toBe(ERROR);
      expect(errorEn(c, 0)).toBe('#VALUE!');
    }
  });
});

describe('lo que va al modo compatible (con su motivo)', () => {
  const motivo = (f: string) => {
    const n = ast(f);
    return n.tipo === 'no-soportado' ? n.motivo : null;
  };

  it('una LAMBDA recursiva', () => {
    expect(motivo('FACTREC(5)')).toMatch(/recursiva/);
  });

  it('una LAMBDA sin invocar o pasada a MAP', () => {
    expect(motivo('LAMBDA(x,x)')).toMatch(/sin invocar/);
    expect(motivo('MAP(A1:A3,LAMBDA(x,x*2))')).toMatch(/MAP/);
    expect(motivo('PR_KAPPA+1')).toMatch(/no se invoca/);
  });

  it('un valor con RIESGO usado dos veces serían dos sorteos', () => {
    expect(motivo('LET(x,RIESGO.NORMAL(0,1),x-x)')).toMatch(/RIESGO/);
    expect(motivo('LAMBDA(t,t*t)(RIESGO.NORMAL(310,5))')).toMatch(/RIESGO/);
    // Usado una vez, o con la función en otra celda, no hay problema.
    expect(motivo('LET(x,RIESGO.NORMAL(0,1),x+1)')).toBeNull();
    expect(motivo('LAMBDA(t,t*t)(B8)')).toBeNull();
    // Dos llamadas a la LAMBDA con RIESGO dentro son dos sorteos también en Excel.
    expect(motivo('LET(f,LAMBDA(x,x+RIESGO.NORMAL(0,1)),f(1)+f(2))')).toBeNull();
  });

  it('un nombre que se define a partir de sí mismo', () => {
    const r = parsear('A_1+1', leerNombresDefinidos([{ nombre: 'A_1', formula: 'B_1*2' }, { nombre: 'B_1', formula: 'A_1' }]).libro);
    expect(r.ok && r.ast.tipo === 'no-soportado' && r.ast.motivo).toMatch(/sí mismo/);
  });
});

describe('nombres definidos', () => {
  it('una LAMBDA recibe otra como argumento', () => {
    expect(numeroEn(evaluar('LAMBDA(f,x,f(f(x)))(LAMBDA(y,y*3),2)'), 0)).toBe(18);
    expect(numeroEn(evaluar('LAMBDA(f,f(W_CO2))(PR_KAPPA)'), 0)).toBeCloseTo(0.7064205977968, 12);
  });

  it('un parámetro tapa un nombre del libro', () => {
    expect(numeroEn(evaluar('LAMBDA(R_GAS,R_GAS*2)(5)'), 0)).toBe(10);
  });

  it('el de la hoja tapa al del libro, y solo en su hoja', () => {
    const extra = [{ nombre: 'R_GAS', formula: '=1', hoja: H }, { nombre: 'OTRO', formula: '=2', hoja: 'Otra' }];
    expect(numeroEn(evaluar('R_GAS*10', extra), 0)).toBe(10);
    const r = ast('OTRO+1');
    expect(r.tipo === 'binaria' && r.izq.tipo).toBe('nombre');
  });

  it('los de referencias relativas se dejan fuera, con el motivo', () => {
    const n = leerNombresDefinidos([{ nombre: 'IZQUIERDA', formula: '=Hoja1!A1' }, { nombre: 'FIJA', formula: '=Hoja1!$A$1' }]);
    expect(n.libro.has('IZQUIERDA')).toBe(false);
    expect(n.libro.has('FIJA')).toBe(true);
    expect(n.descartados[0]).toMatch(/relativas/);
  });

  it('un rango con nombre dentro de SUMA', () => {
    const extra = [{ nombre: 'CRITICOS', formula: '=Fidelidad!$I$2:$I$4' }];
    expect(numeroEn(evaluar('SUM(CRITICOS)', extra), 0)).toBeCloseTo(304.13 + 73.77 + 0.2239, 10);
  });

  it('las dependencias salen del árbol ya resuelto', () => {
    const celdas: FormulaCelda[] = [{ hoja: H, col: 1, fila: 1, formula: 'PR_P(H2,H3,TC_CO2,PC_CO2,W_CO2)' }];
    const { grafo } = construirGrafo(celdas, [], leerNombresDefinidos(definiciones()));
    const deps = [...(grafo.dependencias.get(claveDeReferencia(H, 'A1')) ?? [])].sort();
    expect(deps).toEqual(['H2', 'H3', 'I2', 'I3', 'I4'].map((r) => claveDeReferencia(H, r)));
  });
});

describe('simulación de la hoja PengRobinson (motor rápido)', () => {
  it('T y v inciertas con RIESGO en sus celdas: las tres formas dan la misma presión', async () => {
    const P = 'PengRobinson';
    const kP = (ref: string) => claveDeReferencia(P, ref);
    const conCeldas = (f: string) => f.replace(/I2/g, 'B4').replace(/I3/g, 'B5').replace(/I4/g, 'B6').replace(/H2/g, 'B8').replace(/H3/g, 'B9');
    const formulas: Record<string, string> = {
      B4: '304.13', B5: '73.77', B6: '0.2239',
      B8: 'RIESGO.NORMAL(310,5)',
      B9: 'RIESGO.TRIANGULAR(0.45,0.5,0.6)',
      B11: 'PR_P(B8,B9,B4,B5,B6)',
      B12: conCeldas(PR_LET),
      B13: conCeldas(PR_INLINE).replace('(350,0.3)', '(B8,B9)'),
    };
    const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({ hoja: P, col: 2, fila: Number(ref.slice(1)), formula }));
    const { grafo } = construirGrafo(celdas, [], leerNombresDefinidos(definiciones()));
    const salidas = ['B11', 'B12', 'B13'].map(kP);

    const d = entradasDeFunciones(celdas, grafo, [], salidas);
    expect(d.errores).toEqual([]);
    aplicarReescrituras(grafo, d);
    expect(elegirMotor(grafo, d.claves, salidas).motor).toBe('fast');

    const base = modeloVacio();
    const n = 20_000;
    const modelo = { ...base, inputs: d.entradas, outputs: salidas.map((s, i) => ({ id: `s${i}`, name: s, ref: s })), settings: { ...base.settings, iterations: n, seed: 7 } };
    const p = prepararEntradas(modelo, resolverConFunciones((ref) => ref, d), 7);
    if (!p.ok) throw new Error(p.errores.join('; '));
    const c = compilarPlan(grafo, new Set(d.claves), salidas);
    if (!c.ok) throw new Error(c.error.motivo);
    const r = await simularPorBloques(grafo, c.plan, p.entradas, 7, n);
    if (!r.ok) throw new Error(r.error.motivo);
    const medias = salidas.map((s) => (r.porSalida.get(s)?.welford as { media: number }).media);
    const desv = salidas.map((s) => {
      const w = r.porSalida.get(s)?.welford as { m2: number; n: number };
      return Math.sqrt(w.m2 / (w.n - 1));
    });
    expect(medias[1]).toBeCloseTo(medias[0] as number, 9);
    expect(medias[2]).toBeCloseTo(medias[0] as number, 9);
    expect(desv[1]).toBeCloseTo(desv[0] as number, 9);
    // Python, 400.000 iteraciones por su cuenta: media 39,371 y desviación 2,064 bar.
    expect(medias[0]).toBeCloseTo(39.371, 1);
    expect(desv[0]).toBeCloseTo(2.064, 1);
  });
});
