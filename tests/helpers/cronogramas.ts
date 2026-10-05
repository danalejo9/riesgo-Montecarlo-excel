/** Cronogramas de prueba para el motor QRSA. */
import { CONFIGURACION_POR_DEFECTO, LUNES_A_VIERNES, type ActividadRed, type ModeloCronograma, type RiesgoCronograma, type IncertidumbreActividad } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

export const INICIO_2027 = serieDeFecha(2027, 1, 4);

export function modelo(
  actividades: ActividadRed[], incertidumbre: IncertidumbreActividad[] = [], riesgos: RiesgoCronograma[] = [],
  configuracion: Partial<ModeloCronograma['configuracion']> = {},
): ModeloCronograma {
  return {
    red: { inicio: INICIO_2027, calendarios: [{ id: 'base', laborables: LUNES_A_VIERNES }], actividades },
    incertidumbre, riesgos, configuracion: { ...CONFIGURACION_POR_DEFECTO, ...configuracion },
  };
}

/**
 * Red sintética de `n` actividades en `capas` capas: cada actividad depende
 * de una a tres de la capa anterior (relaciones de los cuatro tipos), como un
 * cronograma de obra grande. Determinista: no usa azar.
 */
export function redSintetica(n: number, riesgos: number): ModeloCronograma {
  const actividades: ActividadRed[] = [];
  const incertidumbre: IncertidumbreActividad[] = [];
  const ancho = 12;
  for (let i = 0; i < n; i++) {
    const capa = Math.floor(i / ancho);
    const predecesoras: ActividadRed['predecesoras'][number][] = [];
    if (capa > 0) {
      const k = 1 + (i % 3);
      for (let j = 0; j < k; j++) {
        const p = (capa - 1) * ancho + ((i * 7 + j * 5) % ancho);
        if (p < n && !predecesoras.some((x) => x.id === `A${p}`)) {
          predecesoras.push({ id: `A${p}`, tipo: (['FC', 'FC', 'CC', 'FF'] as const)[(i + j) % 4] as 'FC', desfase: (i + j) % 5 === 0 ? 2 : 0 });
        }
      }
    }
    const base = 3 + ((i * 13) % 20);
    actividades.push({ id: `A${i}`, nombre: `Actividad ${i}`, duracion: base, predecesoras });
    incertidumbre.push({ actividad: `A${i}`, distribucion: { tipo: 'triangular', min: 0.9, moda: 1, max: 1.5 }, relativa: true });
  }
  actividades.push({ id: 'FIN', nombre: 'Fin', duracion: 0, predecesoras: actividades.slice(-ancho).map((a) => ({ id: a.id, tipo: 'FC' as const, desfase: 0 })) });
  const rs: RiesgoCronograma[] = Array.from({ length: riesgos }, (_, r) => ({
    id: `R${r}`, nombre: `Riesgo ${r}`, probabilidad: 0.1 + (r % 5) * 0.1,
    impactos: [0, 1].map((j) => ({ actividad: `A${(r * 37 + j * 11) % n}`, dias: { tipo: 'triangular' as const, min: 2, moda: 5, max: 12 } })),
  }));
  return modelo(actividades, incertidumbre, rs);
}
