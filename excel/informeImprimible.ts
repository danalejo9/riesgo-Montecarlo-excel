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

import { resumirDistribucion, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { probabilidadUmbral } from '../engine/stats/index.ts';
import { compararSalida, salidaDeReferencia, type FilaComparacion, type ReferenciaGuardada } from './comparacion.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';

export interface SalidaInforme extends Omit<ResultadoSalida, 'muestraOrdenada'> {
  umbral?: { texto: string; probabilidad: number };
  comparacion?: FilaComparacion[];
  cdfReferencia?: ResultadoSalida['cdf'];
}

export interface DatosInforme {
  version: 1;
  titulo: string;
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
    titulo: 'Análisis de riesgo — simulación Monte Carlo',
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
    entradas: modelo.inputs.map((e) => ({
      nombre: e.name,
      ref: e.ref,
      distribucion: resumirDistribucion(e.dist),
      correlaciones: e.correlations.map((c) => `${nombrePorId.get(c.with) ?? c.with}: ${c.coefficient}`).join('; '),
    })),
    ...(ref ? { referencia: ref.etiqueta } : {}),
    salidas: resultado.salidas.map(({ muestraOrdenada, ...s }) => {
      const umbral = modelo.outputs.find((o) => o.id === s.id)?.threshold;
      const deRef = ref ? salidaDeReferencia(ref, s.id) : undefined;
      return {
        ...s,
        ...(umbral && muestraOrdenada && muestraOrdenada.length > 0
          ? {
              umbral: {
                texto: `Probabilidad de quedar ${umbral.direction === 'below' ? 'por debajo' : 'por encima'} de ${umbral.value.toLocaleString('es-ES')}`,
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

/** Base64 apto para URL, sin relleno. */
function aBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array {
  const b = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function transformar(bytes: Uint8Array, flujo: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const salida = new Blob([bytes.slice().buffer]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

/** Los datos, comprimidos y listos para ir detrás de `#d=`. */
export async function codificarInforme(datos: DatosInforme): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(datos));
  return aBase64Url(await transformar(json, new CompressionStream('deflate-raw')));
}

export async function decodificarInforme(codigo: string): Promise<DatosInforme | null> {
  try {
    const json = await transformar(deBase64Url(codigo), new DecompressionStream('deflate-raw'));
    const datos = JSON.parse(new TextDecoder().decode(json)) as DatosInforme;
    return datos && datos.version === 1 && Array.isArray(datos.salidas) ? datos : null;
  } catch {
    return null;
  }
}
