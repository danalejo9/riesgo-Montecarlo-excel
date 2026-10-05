/**
 * Cronograma sintético para medir el Gantt (prueba 8): `n` actividades en
 * grupos de 20 con su resumen, y unas 1,5 relaciones por actividad (de los
 * cuatro tipos, algunas con desfase), siempre hacia atrás para que no haya
 * ciclos. Se arma sobre las hojas del ejemplo, sin incertidumbre ni riesgos.
 */

import { COLUMNAS, HOJAS_CRONOGRAMA, hojasNuevasCronograma, type MatrizHoja } from './cronogramaHojas.ts';

export function hojasSinteticas(inicio: number, n = 2000, relacionesPorActividad = 1.55): Record<string, MatrizHoja> {
  const H = HOJAS_CRONOGRAMA;
  const base = Object.fromEntries(hojasNuevasCronograma(inicio).map((h) => [h.nombre, h.valores.map((f) => [...f])])) as Record<string, unknown[][]>;
  let semilla = 12345;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  const act: unknown[][] = [[...COLUMNAS.actividades]];
  const rel: unknown[][] = [[...COLUMNAS.relaciones]];
  const tareas: string[] = [];
  let grupo = 0;
  for (let i = 0; i < n; i++) {
    if (i % 20 === 0) {
      grupo++;
      act.push([`G${grupo}`, `Grupo ${grupo}`, String(grupo), 'Resumen']);
    }
    const id = `T${i + 1}`;
    const hito = i % 50 === 49;
    act.push([id, `Actividad ${i + 1}`, `${grupo}.${(i % 20) + 1}`, hito ? 'Hito' : 'Tarea', hito ? 0 : 1 + Math.floor(azar() * 20)]);
    if (tareas.length) {
      // De una a tres predecesoras entre las 60 anteriores: una red ancha, con muchas rutas en paralelo.
      const k = Math.max(1, Math.round(relacionesPorActividad + (azar() - 0.5)));
      const usadas = new Set<string>();
      for (let j = 0; j < k; j++) {
        const p = tareas[Math.max(0, tareas.length - 1 - Math.floor(azar() * 60))] as string;
        if (usadas.has(p)) continue;
        usadas.add(p);
        const r = azar();
        const tipo = j === 0 || r < 0.85 ? 'FC' : r < 0.93 ? 'CC' : 'FF';
        const desfase = azar() < 0.1 ? Math.floor(azar() * 5) : 0;
        rel.push([p, id, tipo, desfase, desfase ? 'Laborables' : null]);
      }
    }
    tareas.push(id);
  }
  const vacia = (nombre: string) => [base[nombre]?.[0] ?? []];
  return {
    ...base,
    [H.actividades]: act,
    [H.relaciones]: rel,
    [H.incertidumbre]: vacia(H.incertidumbre),
    [H.riesgos]: vacia(H.riesgos),
    [H.impactos]: vacia(H.impactos),
    [H.costos]: vacia(H.costos),
    [H.correlaciones]: [base[H.correlaciones]?.[0] ?? []],
    [H.ramas]: vacia(H.ramas),
  };
}
