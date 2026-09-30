/**
 * Los datos del **informe imprimible** (el "PDF"), y cómo viajan hasta la
 * página que lo pinta. Sin Office.js.
 *
 * El panel de un complemento no puede guardar archivos en el disco del usuario
 * ni imprimir de forma fiable dentro de Excel. Lo que sí puede es abrir una
 * página en el navegador del sistema, y ahí "Imprimir → Guardar como PDF"
 * funciona siempre y sin instalar nada. Así que el informe es una página
 * (`informe.html`) y los datos van **en la propia dirección**, comprimidos,
 * detrás de `#`: el fragmento no sale nunca del equipo (el navegador no lo
 * envía al servidor), así que los números del libro siguen sin salir de él.
 *
 * Se manda todo lo que el informe enseña —resumen, curva, histograma,
 * sensibilidad, araña, precisión, umbral ya calculado, comparación— y nada de
 * lo que no: ni la muestra ni los cuantiles, que no se imprimen.
 */

import { resumirDistribucion, textoFecha, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { probabilidadUmbral } from '../engine/stats/index.ts';
import { compararSalida, salidaDeReferencia, type FilaComparacion, type ReferenciaGuardada } from './comparacion.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';
import type { FilaRiesgo } from './registroRiesgos.ts';
import { esSalidaDeTexto } from './analisisTexto.ts';
import { lecturaDeSalida, lecturaDeTexto } from './lectura.ts';
import { codificarJson, decodificarJson } from './codificacion.ts';

export interface SalidaInforme extends Omit<ResultadoSalida, 'muestraOrdenada' | 'muestraTexto'> {
  umbral?: { texto: string; probabilidad: number };
  comparacion?: FilaComparacion[];
  cdfReferencia?: ResultadoSalida['cdf'];
  /** La lectura en palabras (C7). */
  lectura?: string[];
}

export interface DatosInforme {
  version: 1;
  titulo: string;
  /** La descripción del proyecto, si el modelo la tiene (C7). */
  descripcion?: string;
  generado: string;
  libro?: string;
  ajustes: {
    iteraciones: number;
    semilla: number;
    muestreo: string;
    motor: string;
    hilos?: number;
    tiempoMs: number;
    tandas?: number[];
  };
  entradas: { nombre: string; ref: string; distribucion: string; correlaciones: string }[];
  referencia?: string;
  /** El registro de riesgos (T8), si el libro tiene `RIESGO.EVENTO`. */
  registroRiesgos?: FilaRiesgo[];
  salidas: SalidaInforme[];
}

export function datosDelInforme(
  modelo: ModeloRiesgo,
  resultado: SimulacionCompletada,
  opciones: { libro?: string; referencia?: ReferenciaGuardada | null; ahora?: Date } = {},
): DatosInforme {
  const nombrePorId = new Map(modelo.inputs.map((e) => [e.id, e.name] as const));
  const ref = opciones.referencia && opciones.referencia.resultado.idSimulacion !== resultado.idSimulacion
    ? opciones.referencia
    : null;

  return {
    version: 1,
    titulo: modelo.project?.title.trim() || 'Análisis de riesgo — simulación Monte Carlo',
    ...(modelo.project?.description?.trim() ? { descripcion: modelo.project.description.trim() } : {}),
    generado: (opciones.ahora ?? new Date()).toISOString(),
    ...(opciones.libro ? { libro: opciones.libro } : {}),
    ajustes: {
      iteraciones: resultado.iteracionesCompletadas,
      semilla: modelo.settings.seed,
      muestreo: modelo.settings.sampling === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo',
      motor: resultado.motor === 'fast' ? 'Rápido (en memoria)' : 'Compatible (Excel en el bucle)',
      ...(resultado.hilos ? { hilos: resultado.hilos } : {}),
      tiempoMs: resultado.milisegundos,
      ...(resultado.convergencia && !resultado.convergencia.noDisponible ? { tandas: resultado.convergencia.tandas } : {}),
    },
    entradas: [
      ...modelo.inputs.map((e) => ({
        nombre: e.name,
        ref: e.ref,
        distribucion: resumirDistribucion(e.dist),
        correlaciones: e.correlations.map((c) => `${nombrePorId.get(c.with) ?? c.with}: ${c.coefficient}`).join('; '),
      })),
      ...(resultado.entradasDeFunciones ?? []).map((e) => ({
        nombre: `${e.nombre && e.nombre !== e.ref ? e.nombre : e.ref} (RIESGO)`, ref: e.ref, distribucion: e.distribucion, correlaciones: '',
      })),
    ],
    ...(ref ? { referencia: ref.etiqueta } : {}),
    ...(resultado.registroRiesgos && resultado.registroRiesgos.length > 0 ? { registroRiesgos: resultado.registroRiesgos } : {}),
    salidas: resultado.salidas.map(({ muestraOrdenada, ...conTexto }) => {
      // La muestra de textos (hasta 100.000) no viaja: el informe no la enseña.
      const s = { ...conTexto };
      delete s.muestraTexto;
      const umbral = modelo.outputs.find((o) => o.id === s.id)?.threshold;
      const deRef = ref ? salidaDeReferencia(ref, s.id) : undefined;
      const probabilidad = umbral && muestraOrdenada && muestraOrdenada.length > 0
        ? probabilidadUmbral(muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima')
        : undefined;
      const valorDeInteres = modelo.outputs.find((o) => o.id === s.id)?.valueOfInterest;
      const lectura = esSalidaDeTexto(s)
        ? lecturaDeTexto({ nombre: s.nombre, categorias: s.categorias ?? [], ...(valorDeInteres ? { valorDeInteres } : {}), ...(s.decisivas ? { decisivas: s.decisivas } : {}) })
        : lecturaDeSalida({
          ...s,
          ...(umbral && probabilidad !== undefined ? { umbral: { valor: umbral.value, sentido: umbral.direction, probabilidad } } : {}),
        });
      return {
        ...s,
        ...(lectura.length > 0 ? { lectura } : {}),
        ...(umbral && muestraOrdenada && muestraOrdenada.length > 0
          ? {
              umbral: {
                texto: `Probabilidad de quedar ${umbral.direction === 'below' ? 'por debajo' : 'por encima'} de ${s.fecha ? textoFecha(umbral.value) : umbral.value.toLocaleString('es-ES')}`,
                probabilidad: probabilidadUmbral(muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima'),
              },
            }
          : {}),
        ...(deRef
          ? { comparacion: compararSalida({ ...s, muestraOrdenada }, deRef, umbral), cdfReferencia: deRef.cdf }
          : {}),
      };
    }),
  };
}

/** Los datos, comprimidos y listos para ir detrás de `#d=`. */
export async function codificarInforme(datos: DatosInforme): Promise<string> {
  return codificarJson(datos);
}

export async function decodificarInforme(codigo: string): Promise<DatosInforme | null> {
  const datos = (await decodificarJson(codigo)) as DatosInforme | null;
  return datos && datos.version === 1 && Array.isArray(datos.salidas) ? datos : null;
}
