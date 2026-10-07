/**
 * W6: las hojas del libro de cronograma con el ejemplo de un sector
 * (`engine/cronograma/sectores.ts`), en el formato de siempre: las mismas
 * hojas, listas y ayudas que el ejemplo de la obra, con los datos del sector.
 * Sin Office.js.
 *
 * - Actividades: el grupo de cada una es su tipo de trabajo (sirve para la
 *   incertidumbre por grupo, el clima y la biblioteca de Rangos_Tipo).
 * - Riesgos e impactos: el impacto de cada riesgo (una proporción de la
 *   duración) se pasa a días en cada actividad afectada; el costo si ocurre
 *   va en la primera. La mitigación da la probabilidad post y el % del
 *   impacto post (el más probable después frente al de antes).
 * - Costos: lo que cuesta cada día de actividad, los costos fijos y el
 *   indirecto del proyecto por día.
 * - El hito contractual: el fin del hito en el plan más el margen del sector.
 */

import { compilarRed, cpmDeterministico, EJEMPLOS_SECTOR, leerPredecesoras, type EjemploSector, type IdSector } from '../engine/cronograma/index.ts';
import { ETIQUETAS_CONFIG, hojaEscenarios, HOJAS_CRONOGRAMA as H, hojasNuevasCronograma, leerCronograma, type Celda, type HojaNueva } from './cronogramaHojas.ts';

const NOMBRE_CALENDARIO = (lab: readonly boolean[]) => (lab[5] ? 'Lunes a sábado' : 'Lunes a viernes');
const redondo = (x: number) => Math.round(x * 10) / 10;

/** Los ids de las actividades de un ejemplo que nombra un texto («7;8» o «Acabados;Instalaciones»). */
function afectadas(e: EjemploSector, texto: string): string[] {
  const out: string[] = [];
  for (const t of texto.split(';').map((x) => x.trim()).filter(Boolean)) {
    const porId = e.actividades.find((a) => a[0] === t);
    const ids = porId ? [porId[0]] : e.actividades.filter((a) => a[6] === t).map((a) => a[0]);
    for (const id of ids) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Las hojas del ejemplo del sector `id`, con el proyecto empezando en `inicio` (número de serie, un lunes). */
export function hojasDeSector(id: IdSector, inicio: number): HojaNueva[] {
  const e = EJEMPLOS_SECTOR.find((x) => x.id === id);
  if (!e) throw new Error(`No hay ejemplo «${id}»`);
  const base = hojasNuevasCronograma(inicio);
  const cal = NOMBRE_CALENDARIO(e.laborables);
  const dur = new Map(e.actividades.map((a) => [a[0], a[2]]));

  const actividades: Celda[][] = e.actividades.map(([aid, nombre, d, , , , grupo]) => [
    aid, nombre, '', d === 0 ? 'Hito' : 'Tarea', d, '', '', null, d === 0 ? '' : 'No', grupo, null, null, null, null, null,
  ]);
  const relaciones: Celda[][] = [];
  for (const [aid, , , preds] of e.actividades) {
    const l = leerPredecesoras(preds.replace(/;/g, '; '));
    if (!l.ok) throw new Error(`Ejemplo «${id}», actividad ${aid}: ${l.error}`);
    for (const p of l.predecesoras) relaciones.push([p.id, aid, p.tipo, p.desfase, 'Laborables']);
  }
  const incertidumbre: Celda[][] = e.actividades
    .filter(([, , d, , min, max]) => d > 0 && min !== '' && max !== '')
    .map(([aid, , d, , min, max]) => [aid, 'Triangular', min, d, max, 'Días', null]);

  const riesgos: Celda[][] = [];
  const impactos: Celda[][] = [];
  for (const [rid, nombre, p, i1, i2, i3, acts, costo, , dueno, costoMit, pPost, , i2Post, , categoria] of e.riesgos) {
    const ids = afectadas(e, acts).filter((a) => (dur.get(a) ?? 0) > 0);
    const factor = i2Post !== '' && i2 !== 0 ? Math.round((i2Post / i2) * 100) / 100 : null;
    riesgos.push([rid, nombre, null, null, dueno || null, categoria, p, 'Activo', pPost === '' ? null : pPost, factor, costoMit === '' ? null : costoMit, 'Extiende actividades', null, null]);
    ids.forEach((a, k) => {
      const d = dur.get(a) as number;
      impactos.push([rid, a, 'Triangular', redondo(i1 * d), redondo(i2 * d), redondo(i3 * d), null, k === 0 && costo !== '' ? costo : null, null]);
    });
  }

  const costos: Celda[][] = [];
  for (const [aid, nombre, , , , , , porDia, fijo] of e.actividades) {
    if (porDia !== '') costos.push([`CD-${aid}`, `${nombre}: costo por día`, 'Por tiempo', aid, porDia, null, null, null, null, null, null]);
    if (fijo !== '') costos.push([`CF-${aid}`, `${nombre}: costo fijo`, 'Fijo', aid, fijo, null, null, null, null, null, null]);
  }
  costos.push(['IND', 'Indirectos del proyecto (administración, vigilancia, alquileres)', 'Por tiempo', '', e.costoIndirectoDia, null, null, null, null, null, null]);

  // La fecha del contrato: el fin del hito en el plan más el margen (días naturales).
  const borrador = reemplazar(base, { actividades, relaciones, cal, laborables: e.laborables });
  const l = leerCronograma(Object.fromEntries(borrador.map((h) => [h.nombre, h.valores])));
  if (!l.modelo) throw new Error(`El ejemplo «${id}» no se lee: ${l.errores.map((x) => x.mensaje).join('; ')}`);
  const finHito = cpmDeterministico(compilarRed(l.modelo.red)).filas.find((f) => f.id === e.hito.id)?.fin;
  if (finHito === undefined) throw new Error(`El ejemplo «${id}» no tiene el hito ${e.hito.id}`);
  const fechaContrato = finHito + e.hito.margen;

  const sabados = !e.laborables[5];
  const conMitigacion = e.riesgos.filter((r) => r[11] !== '' || r[13] !== '').map((r) => r[0]);
  const escenarios: Celda[][] = [
    ...(sabados ? [['Trabajar los sábados', 'Trabajar sábados', '', 'Sí', 'Un turno más por semana'] as Celda[]] : []),
    ['Sin el riesgo principal', 'Quitar riesgo', e.riesgos[0]?.[0] ?? '', null, '¿Cuánto vale eliminarlo del todo?'],
    ...(conMitigacion.length ? [['Todas las mitigaciones', 'Aplicar mitigación', conMitigacion.join('; '), null, 'Con la probabilidad y el impacto post de la hoja Riesgos'] as Celda[]] : []),
  ];

  return reemplazar(base, {
    actividades, relaciones, cal, laborables: e.laborables, incertidumbre, riesgos, impactos, costos, escenarios,
    hito: [e.hito.id, fechaContrato, e.hito.multaDia, e.hito.tope, e.hito.nota],
    config: { meta: fechaContrato, moneda: 'USD' },
  });
}

interface Datos {
  actividades: Celda[][];
  relaciones: Celda[][];
  cal: string;
  laborables: readonly boolean[];
  incertidumbre?: Celda[][];
  riesgos?: Celda[][];
  impactos?: Celda[][];
  costos?: Celda[][];
  escenarios?: Celda[][];
  hito?: Celda[];
  config?: { meta: number; moneda: string };
}

/** Las hojas del ejemplo de la obra con los datos del sector (las que no se dan, con solo el encabezado). */
function reemplazar(base: readonly HojaNueva[], d: Datos): HojaNueva[] {
  const enc = (h: HojaNueva) => [h.valores[0] as Celda[]];
  return base.map((h): HojaNueva => {
    switch (h.nombre) {
      case H.config:
        return {
          ...h,
          valores: h.valores.map((f): Celda[] => {
            if (f[0] === ETIQUETAS_CONFIG.calendario) return [f[0], d.cal, f[2] ?? null];
            if (f[0] === ETIQUETAS_CONFIG.meta) return [f[0], d.config?.meta ?? null, f[2] ?? null];
            if (f[0] === ETIQUETAS_CONFIG.moneda) return [f[0], d.config?.moneda ?? f[1] ?? null, f[2] ?? null];
            if (f[0] === ETIQUETAS_CONFIG.costoMeta) return [f[0], null, f[2] ?? null];
            return [...f];
          }),
        };
      case H.calendario: {
        // Un solo calendario, el del sector, con los festivos de Colombia que ya trae el ejemplo.
        const filas = h.valores.map((f, i) => {
          if (i === 0) return [...f];
          const der = f.slice(8);
          const izq: Celda[] = i === 1 ? [d.cal, ...d.laborables.map((x) => (x ? 'Sí' : 'No'))] : [null, null, null, null, null, null, null, null];
          return [...izq, ...der];
        });
        return { ...h, valores: filas };
      }
      case H.actividades: return { ...h, valores: [...enc(h), ...d.actividades] };
      case H.relaciones: return { ...h, valores: [...enc(h), ...d.relaciones] };
      case H.incertidumbre: return { ...h, valores: [...enc(h), ...(d.incertidumbre ?? [])] };
      case H.riesgos: return { ...h, valores: [...enc(h), ...(d.riesgos ?? [])] };
      case H.impactos: return { ...h, valores: [...enc(h), ...(d.impactos ?? [])] };
      case H.costos: return { ...h, valores: [...enc(h), ...(d.costos ?? [])] };
      case H.correlaciones: return { ...h, valores: enc(h) };
      case H.hitosContrato: return { ...h, valores: [...enc(h), ...(d.hito ? [d.hito] : [])] };
      case H.escenarios: return hojaEscenarios(d.escenarios ?? []);
      default: return h;
    }
  });
}

/** Los ejemplos que se ofrecen al crear el libro: la obra de siempre y los cuatro sectores. */
export const EJEMPLOS_LIBRO: readonly { id: 'obra' | IdSector; nombre: string; descripcion: string }[] = [
  { id: 'obra', nombre: 'Obra (edificio de 14 actividades)', descripcion: 'El ejemplo de siempre: diseño, licencia, obra gris y acabados, con riesgos, costos y una oportunidad.' },
  ...EJEMPLOS_SECTOR.map((e) => ({ id: e.id, nombre: e.nombre, descripcion: e.descripcion })),
];

/** Las hojas de un ejemplo del libro. */
export function hojasDeEjemplo(id: 'obra' | IdSector, inicio: number): HojaNueva[] {
  return id === 'obra' ? hojasNuevasCronograma(inicio) : hojasDeSector(id, inicio);
}
