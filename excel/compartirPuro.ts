/**
 * «Preparar para compartir»: la parte pura (qué celdas se convierten y cómo
 * cambia el modelo). Sin Office.js. Ver `compartir.ts` para la escritura.
 *
 * El problema, detectado en la revisión con el estudio de mercado: una celda
 * con `=RIESGO.NORMAL(…)` abierta en un Excel **sin el complemento** acaba en
 * `#¿NOMBRE?` al recalcular, y con ella todo lo que depende de ella. Hoy quien
 * recibe un libro con el modelo en el panel ve un Excel normal; las funciones
 * `RIESGO.*` romperían esa ventaja.
 *
 * La solución: antes de enviar el libro, cada `RIESGO.*` se convierte en una
 * **entrada del panel** (el modelo, que viaja en `workbook.settings` y que un
 * Excel sin el complemento simplemente ignora) y la celda recibe su **valor
 * base**, la media. Quien abre el libro sin el complemento ve números; quien
 * lo abre con él, sigue teniendo las mismas entradas inciertas. Las fórmulas
 * originales se guardan para poder volver a ellas («Restaurar»).
 */

import type { FormulaCelda } from '../engine/graph/index.ts';
import { generarId, leerFuncionRiesgo, mencionaRiesgo, type DistributionSpec, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { claveCelda, letrasDeColumna } from '../engine/parser/ast.ts';
import { componerDireccion } from './direcciones.ts';

export interface ConversionCompartir {
  /** Dirección para Office.js y para el modelo: `Pruebas!C5`, `'Mi hoja'!C5`. */
  direccion: string;
  clave: string;
  formula: string;
  /** Lo que se escribe en la celda: la media de la distribución. */
  valorBase: number;
  spec: DistributionSpec;
}

export interface PlanCompartir {
  conversiones: ConversionCompartir[];
  /** Celdas con `RIESGO.*` que no se pueden convertir, con el motivo: no se tocan. */
  noConvertibles: string[];
}

export function planificarCompartir(formulas: readonly FormulaCelda[]): PlanCompartir {
  const plan: PlanCompartir = { conversiones: [], noConvertibles: [] };
  for (const f of formulas) {
    if (!mencionaRiesgo(f.formula)) continue;
    const clave = claveCelda(f.hoja, f.col, f.fila);
    const r = leerFuncionRiesgo(f.formula);
    if (!r.ok) {
      plan.noConvertibles.push(`${clave}: ${r.motivo}`);
      continue;
    }
    plan.conversiones.push({
      direccion: componerDireccion(f.hoja, `${letrasDeColumna(f.col)}${f.fila}`),
      clave,
      formula: f.formula.startsWith('=') ? f.formula : `=${f.formula}`,
      valorBase: r.media,
      spec: r.spec,
    });
  }
  return plan;
}

/** Prefijo de los ids de las entradas creadas al preparar: así se reconocen al restaurar. */
export const PREFIJO_COMPARTIR = 'rc_';

/**
 * El modelo con las `RIESGO.*` convertidas en entradas del panel. Si una celda
 * ya era entrada del panel, se deja la del panel (manda el panel, como al
 * simular).
 */
export function modeloParaCompartir(modelo: ModeloRiesgo, plan: PlanCompartir): ModeloRiesgo {
  const yaEstan = new Set(modelo.inputs.map((e) => e.ref.replace(/'/g, '').toUpperCase()));
  const nuevas = plan.conversiones
    .filter((c) => !yaEstan.has(c.direccion.replace(/'/g, '').toUpperCase()))
    .map((c) => ({
      id: `${PREFIJO_COMPARTIR}${generarId('in').slice(3)}`,
      name: c.clave,
      ref: c.direccion,
      dist: c.spec,
      correlations: [],
    }));
  return { ...modelo, inputs: [...modelo.inputs, ...nuevas] };
}

/** El modelo sin las entradas que creó «Preparar para compartir» (al restaurar las fórmulas). */
export function modeloRestaurado(modelo: ModeloRiesgo, direcciones: readonly string[]): ModeloRiesgo {
  const quitar = new Set(direcciones.map((d) => d.replace(/'/g, '').toUpperCase()));
  const ids = new Set(
    modelo.inputs.filter((e) => e.id.startsWith(PREFIJO_COMPARTIR) && quitar.has(e.ref.replace(/'/g, '').toUpperCase())).map((e) => e.id),
  );
  return {
    ...modelo,
    inputs: modelo.inputs
      .filter((e) => !ids.has(e.id))
      .map((e) => ({ ...e, correlations: e.correlations.filter((c) => !ids.has(c.with)) })),
  };
}
