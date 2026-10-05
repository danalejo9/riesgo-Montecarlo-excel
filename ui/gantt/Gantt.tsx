/**
 * El Gantt completo (G1/G2), en la pestaña «Gantt» de la ventana flotante:
 * barra de herramientas, grid a la izquierda (virtualizado, editable) y línea
 * de tiempo en Canvas a la derecha, con el desplazamiento vertical
 * sincronizado; detalles de la actividad o del vínculo seleccionado, calidad
 * con semáforo y leyenda. Calcula con el mismo motor del QRSA a partir de lo
 * que manda el panel; cada edición vuelve al panel como una operación, que
 * la valida, la escribe en las hojas y devuelve el cronograma nuevo.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { construirVista, explicarCritica, impulsoraHacia, type DatosGantt, type EstadoEdicion, type DefinicionCritica, type FilaGantt, type RelacionGantt, type VistaGantt } from '../../excel/gantt.ts';
import type { OperacionGantt } from '../../excel/edicionGantt.ts';
import { cadena, leerPredecesoras, type CalendarioLaboral, type TipoRelacion, type TipoRestriccion } from '../../engine/cronograma/index.ts';
import { leerFecha, textoFecha } from '../../engine/modelo/fechas.ts';
import { COLORES, COLORES_RUTA, colorCalor, dibujar, rectEnPantalla, type ArrastreGantt, type EscenaGantt, type FlechaDibujada, type Resaltado } from './dibujo.ts';
import { ajustarTodo, distanciaAFlecha, filasVisibles, GEOMETRIA, PX_MAX, PX_MIN, serieEn, tipoVinculo, ZOOMS, zonaBarra, type Escala } from './trazado.ts';
import './gantt.css';

interface Props {
  datos: DatosGantt;
  editable: boolean;
  estado: EstadoEdicion;
  alOperar: (op: OperacionGantt) => void;
  alDeshacer: () => void;
  alRehacer: () => void;
  /** Volver a leer las hojas (cambios hechos a mano en Excel). */
  alReleer?: () => void;
  /** G3: simular el cronograma (en el panel) y traer la criticidad y los rangos. */
  alCorrerQrsa?: () => void;
}

const AE = 40;
const G = GEOMETRIA;
const TIPOS_REL: readonly TipoRelacion[] = ['FC', 'CC', 'FF', 'CF'];
const RESTRICCIONES: { tipo: TipoRestriccion; nombre: string }[] = [
  { tipo: 'SNET', nombre: 'No comenzar antes de' }, { tipo: 'FNET', nombre: 'No terminar antes de' },
  { tipo: 'SNLT', nombre: 'No comenzar después de' }, { tipo: 'FNLT', nombre: 'No terminar después de' },
  { tipo: 'MSO', nombre: 'Debe comenzar el' }, { tipo: 'MFO', nombre: 'Debe terminar el' },
];

type IdColumna = 'diag' | 'wbs' | 'id' | 'nombre' | 'duracion' | 'inicio' | 'fin' | 'predecesoras' | 'sucesoras' | 'ht' | 'hl' | 'critica' | 'restriccion' | 'limite' | 'calendario' | 'p80' | 'criticidad'
  | 'estado' | 'avance' | 'inicioReal' | 'finReal' | 'restante' | 'lbInicio' | 'lbFin' | 'variacion' | 'ruta' | 'phito';
interface Columna { id: IdColumna; titulo: string; ancho: number; editable?: boolean; numero?: boolean; qrsa?: boolean; seguimiento?: boolean; lineaBase?: boolean }
const COLUMNAS: Columna[] = [
  { id: 'diag', titulo: '', ancho: 24 },
  { id: 'wbs', titulo: 'WBS', ancho: 52 },
  { id: 'id', titulo: 'ID', ancho: 52 },
  { id: 'nombre', titulo: 'Nombre', ancho: 230, editable: true },
  { id: 'duracion', titulo: 'Duración', ancho: 66, editable: true, numero: true },
  { id: 'inicio', titulo: 'Comienzo', ancho: 82 },
  { id: 'fin', titulo: 'Fin', ancho: 82 },
  { id: 'predecesoras', titulo: 'Predecesoras', ancho: 130, editable: true },
  { id: 'sucesoras', titulo: 'Sucesoras', ancho: 130 },
  { id: 'ht', titulo: 'Holgura total', ancho: 70, numero: true },
  { id: 'hl', titulo: 'Holgura libre', ancho: 70, numero: true },
  { id: 'critica', titulo: 'Crítica', ancho: 54 },
  { id: 'ruta', titulo: 'Ruta n.º', ancho: 52, numero: true },
  { id: 'restriccion', titulo: 'Restricción', ancho: 170 },
  { id: 'limite', titulo: 'Fecha límite', ancho: 82, editable: true },
  { id: 'calendario', titulo: 'Calendario', ancho: 110 },
  { id: 'estado', titulo: 'Estado', ancho: 76, seguimiento: true },
  { id: 'avance', titulo: '% completado', ancho: 72, editable: true, numero: true, seguimiento: true },
  { id: 'inicioReal', titulo: 'Comienzo real', ancho: 82, editable: true, seguimiento: true },
  { id: 'finReal', titulo: 'Fin real', ancho: 82, editable: true, seguimiento: true },
  { id: 'restante', titulo: 'Duración restante', ancho: 72, editable: true, numero: true, seguimiento: true },
  { id: 'lbInicio', titulo: 'LB comienzo', ancho: 82, lineaBase: true },
  { id: 'lbFin', titulo: 'LB fin', ancho: 82, lineaBase: true },
  { id: 'variacion', titulo: 'Variación (d)', ancho: 70, numero: true, lineaBase: true },
  { id: 'p80', titulo: 'P80 fin (QRSA)', ancho: 90, qrsa: true },
  { id: 'criticidad', titulo: 'Criticidad (QRSA)', ancho: 80, qrsa: true, numero: true },
  { id: 'phito', titulo: 'P(cumplir el hito)', ancho: 80, qrsa: true, numero: true },
];
const VISIBLES_POR_DEFECTO: IdColumna[] = ['diag', 'wbs', 'id', 'nombre', 'duracion', 'inicio', 'fin', 'predecesoras', 'ht', 'critica', 'avance', 'variacion', 'p80', 'criticidad', 'phito'];

const num = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? '' : x.toLocaleString('es-ES', { maximumFractionDigits: d }));
const fecha = (s: number | null) => (s === null || !Number.isFinite(s) ? '' : textoFecha(s));

/** Hoy como número de serie (la fecha local). */
function hoySerie(): number {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000) + 25569;
}

function leerPreferencias(): { columnas?: IdColumna[]; anchos?: Record<string, number>; grid?: number } {
  try {
    return JSON.parse(localStorage.getItem('riesgo.gantt') ?? '{}') as ReturnType<typeof leerPreferencias>;
  } catch {
    return {};
  }
}
function guardarPreferencias(p: ReturnType<typeof leerPreferencias>): void {
  try {
    localStorage.setItem('riesgo.gantt', JSON.stringify(p));
  } catch {
    // sin almacenamiento: se pierden al cerrar
  }
}

export function Gantt({ datos, editable, estado, alOperar, alDeshacer, alRehacer, alReleer, alCorrerQrsa }: Props) {
  // ---------------------------------------------------------- cálculo
  const [definicion, setDefinicion] = useState<DefinicionCritica>('holgura');
  const [umbral, setUmbral] = useState(5);
  /** G3: la línea base que se enseña (undefined: la primera guardada). */
  const [lineaBase, setLineaBase] = useState<number | undefined>(undefined);
  const [automatico, setAutomatico] = useState(true);
  const [calculados, setCalculados] = useState<DatosGantt>(datos);
  useEffect(() => {
    if (automatico) setCalculados(datos);
  }, [datos, automatico]);
  const pendiente = calculados !== datos;
  const calculo = useMemo((): { vista: VistaGantt; ms: number } | { error: string } => {
    const t0 = performance.now();
    try {
      const vista = construirVista(calculados, { definicion, umbralCasiCritica: umbral, ...(lineaBase !== undefined ? { lineaBase } : {}) });
      return { vista, ms: performance.now() - t0 };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [calculados, definicion, umbral, lineaBase]);
  const vista = 'vista' in calculo ? calculo.vista : null;

  // ---------------------------------------------------------- filas visibles
  const [filtro, setFiltro] = useState<'todas' | 'critica' | 'casi'>('todas');
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const filas = useMemo(() => {
    if (!vista) return [] as FilaGantt[];
    const out: FilaGantt[] = [];
    const ocultos = [...plegados].map((id) => vista.filas.find((f) => f.id === id)?.wbs).filter((w): w is string => !!w).map((w) => `${w}.`);
    for (const f of vista.filas) {
      if (ocultos.some((p) => f.wbs.startsWith(p))) continue;
      if (filtro !== 'todas') {
        if (f.tipo === 'resumen') continue;
        if (!(f.critica || (filtro === 'casi' && f.casiCritica))) continue;
      }
      out.push(f);
    }
    return out;
  }, [vista, filtro, plegados]);
  const indiceFila = useMemo(() => new Map(filas.map((f, k) => [f.id, k])), [filas]);

  // ---------------------------------------------------------- selección y resaltado
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [relSel, setRelSel] = useState<number | null>(null);
  const [traza, setTraza] = useState<{ modo: 'impulsora' | 'arriba' | 'abajo' | 'criterio'; id: string; resaltado?: Resaltado; titulo?: string } | null>(null);
  useEffect(() => {
    if (estado.seleccion) {
      setSeleccion(estado.seleccion);
      setRelSel(null);
    }
  }, [estado.seleccion]);
  const filaSel = vista && seleccion ? vista.filas.find((f) => f.id === seleccion) ?? null : null;
  const relacion = vista && relSel !== null ? vista.relaciones.find((r) => r.indice === relSel) ?? null : null;
  const resaltado = useMemo((): Resaltado | null => {
    if (!vista) return null;
    if (traza) {
      if (traza.resaltado) return traza.resaltado;
      if (traza.modo === 'impulsora') return impulsoraHacia(vista, traza.id);
      const i = vista.red.indice.get(traza.id);
      if (i === undefined) return null;
      const c = cadena(vista.red, i, traza.modo === 'arriba' ? 'arriba' : 'abajo');
      return { actividades: new Set([...c.actividades].map((x) => vista.red.ids[x] as string)), relaciones: c.relaciones };
    }
    // Al seleccionar: ella y sus predecesoras y sucesoras directas (§6.3).
    if (seleccion) {
      const act = new Set([seleccion]);
      const rels = new Set<number>();
      for (const r of vista.relaciones) {
        if (r.pred === seleccion || r.suc === seleccion) {
          rels.add(r.indice);
          act.add(r.pred);
          act.add(r.suc);
        }
      }
      return rels.size ? { actividades: act, relaciones: rels } : null;
    }
    return null;
  }, [vista, traza, seleccion]);

  // ---------------------------------------------------------- escala y desplazamiento
  const linea = useRef<HTMLDivElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [px, setPx] = useState<number | null>(null);
  const origen = vista ? vista.inicio - 30 : 0;
  const escala: Escala = { origen, px: px ?? 6 };
  const anchoTotal = vista ? Math.max(800, (vista.fin + 200 - origen) * escala.px) : 800;
  const altoTotal = AE + filas.length * G.altoFila + 40;
  const [tam, setTam] = useState({ ancho: 600, alto: 400 });
  const cuadro = useRef(0);
  const flechas = useRef<FlechaDibujada[]>([]);
  const [arrastre, setArrastre] = useState<(ArrastreGantt & { x0: number; movido: boolean }) | null>(null);
  // Al desplazar no se vuelve a renderizar todo: el lienzo se dibuja directamente
  // y el grid solo cambia cuando cambian las filas visibles.
  const pintar = useRef<() => void>(() => {});
  const repintar = useCallback(() => {
    cancelAnimationFrame(cuadro.current);
    cuadro.current = requestAnimationFrame(() => pintar.current());
  }, []);
  const [rango, setRango] = useState<[number, number]>([0, 40]);
  const actualizarRango = useCallback(() => {
    const g = grid.current;
    const r = filasVisibles(g?.scrollTop ?? 0, (g?.clientHeight ?? 600) - AE, G.altoFila, filas.length);
    setRango((a) => (a[0] === r[0] && a[1] === r[1] ? a : r));
  }, [filas.length]);
  useLayoutEffect(actualizarRango, [actualizarRango, tam]);

  // Al llegar la primera vista: ajustar todo el proyecto.
  const ajustado = useRef(false);
  useLayoutEffect(() => {
    if (!vista || ajustado.current || !linea.current) return;
    ajustado.current = true;
    const a = ajustarTodo(vista.inicio, vista.fin, Math.max(300, linea.current.clientWidth - 40));
    setPx(a.px);
    requestAnimationFrame(() => {
      if (linea.current) linea.current.scrollLeft = Math.max(0, (a.origen - (vista.inicio - 30)) * a.px);
    });
  }, [vista]);

  useEffect(() => {
    const el = linea.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTam({ ancho: el.clientWidth, alto: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = useCallback((nuevo: number, centroPx?: number) => {
    const el = linea.current;
    if (!el || !vista) return;
    const p = Math.min(PX_MAX, Math.max(PX_MIN, nuevo));
    const cx = centroPx ?? el.clientWidth / 2;
    const serie = origen + (el.scrollLeft + cx) / escala.px;
    setPx(p);
    requestAnimationFrame(() => {
      if (linea.current) linea.current.scrollLeft = Math.max(0, (serie - origen) * p - cx);
    });
  }, [vista, origen, escala.px]);

  const ajustarTodoAhora = useCallback(() => {
    const el = linea.current;
    if (!el || !vista) return;
    const a = ajustarTodo(vista.inicio, vista.fin, Math.max(300, el.clientWidth - 40));
    setPx(a.px);
    requestAnimationFrame(() => {
      if (linea.current) linea.current.scrollLeft = Math.max(0, (a.origen - origen) * a.px);
    });
  }, [vista, origen]);

  const irA = useCallback((serie: number) => {
    const el = linea.current;
    if (el) el.scrollLeft = Math.max(0, (serie - origen) * escala.px - el.clientWidth / 3);
  }, [origen, escala.px]);

  const irAFila = useCallback((id: string) => {
    const k = indiceFila.get(id);
    const g = grid.current;
    if (k === undefined || !g) return;
    const y = k * G.altoFila;
    if (y < g.scrollTop || y > g.scrollTop + g.clientHeight - AE - G.altoFila) g.scrollTop = Math.max(0, y - (g.clientHeight - AE) / 3);
  }, [indiceFila]);

  // Desplazamiento vertical sincronizado.
  const alDesplazarGrid = () => {
    const g = grid.current;
    const l = linea.current;
    if (g && l && l.scrollTop !== g.scrollTop) l.scrollTop = g.scrollTop;
    actualizarRango();
  };
  const alDesplazarLinea = () => {
    const g = grid.current;
    const l = linea.current;
    if (!l) return;
    if (g && g.scrollTop !== l.scrollTop) g.scrollTop = l.scrollTop;
    actualizarRango();
    repintar();
  };

  // Ctrl + rueda: zoom alrededor del ratón.
  useEffect(() => {
    const el = linea.current;
    if (!el) return;
    const rueda = (ev: WheelEvent) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(escala.px * (ev.deltaY < 0 ? 1.25 : 0.8), ev.clientX - r.left);
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  }, [zoom, escala.px]);

  // ---------------------------------------------------------- dibujo
  const [capas, setCapas] = useState({ flechas: true, holgura: true, qrsa: true, etiquetas: true, rutas: false, calor: false });
  const escena = useCallback((): EscenaGantt | null => {
    if (!vista) return null;
    const l = linea.current;
    return {
      vista, filas, indiceFila, escala, g: G, ancho: tam.ancho, alto: tam.alto,
      scrollLeft: l?.scrollLeft ?? 0, scrollTop: l?.scrollTop ?? 0, altoEncabezado: AE,
      seleccion, relacionSeleccionada: relSel, resaltado, hoy: hoySerie(), capas, arrastre,
    };
  }, [vista, filas, indiceFila, escala, tam, seleccion, relSel, resaltado, capas, arrastre]);

  pintar.current = () => {
    const c = lienzo.current;
    const e = escena();
    if (!c || !e) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(e.ancho * dpr) || c.height !== Math.round(e.alto * dpr)) {
      c.width = Math.round(e.ancho * dpr);
      c.height = Math.round(e.alto * dpr);
      c.style.width = `${e.ancho}px`;
      c.style.height = `${e.alto}px`;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flechas.current = dibujar(ctx, e);
  };
  useLayoutEffect(() => pintar.current());

  // ---------------------------------------------------------- ratón sobre la línea de tiempo
  const [tooltip, setTooltip] = useState<{ x: number; y: number; contenido: ReactNode } | null>(null);
  const [confirmar, setConfirmar] = useState<{ texto: string; op: OperacionGantt } | null>(null);
  const bajo = (ev: React.MouseEvent) => {
    const e = escena();
    const c = lienzo.current;
    if (!e || !c) return null;
    const r = c.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    if (y < AE) return { x, y, e };
    const k = Math.floor((y - AE + e.scrollTop) / G.altoFila);
    const f = filas[k];
    if (f && Number.isFinite(f.inicio)) {
      const rect = rectEnPantalla(e, k, f);
      const zona = y >= rect.y - 6 && y <= rect.y + rect.alto + 6 ? zonaBarra(rect, x, f.tipo === 'hito') : null;
      if (zona) return { x, y, e, k, f, rect, zona };
    }
    let mejor: { relacion: number; d: number } | null = null;
    for (const fl of flechas.current) {
      const d = distanciaAFlecha(fl.puntos, { x, y });
      if (d < 4 && (!mejor || d < mejor.d)) mejor = { relacion: fl.relacion, d };
    }
    return { x, y, e, k, f, relacion: mejor?.relacion };
  };
  const alMover = (ev: React.MouseEvent) => {
    const b = bajo(ev);
    const c = lienzo.current;
    if (!b || !c || !vista) return;
    if (arrastre) {
      const dx = b.x - arrastre.x0;
      const movido = arrastre.movido || Math.abs(dx) > 3;
      const f = vista.filas.find((x) => x.id === arrastre.id);
      if (!f) return;
      if (arrastre.tipo === 'fin') setArrastre({ ...arrastre, movido, serie: Math.max(f.inicio, Math.round(serieEn(escala, b.x + b.e.scrollLeft)) - 1) });
      else if (arrastre.tipo === 'cuerpo') setArrastre({ ...arrastre, movido, serie: f.inicio + Math.round(dx / escala.px) });
      else setArrastre({ ...arrastre, movido, raton: { x: b.x, y: b.y } });
      return;
    }
    const z = 'zona' in b ? b.zona : null;
    c.style.cursor = !z ? (b.relacion !== undefined ? 'pointer' : 'default')
      : !editable || b.f?.tipo === 'resumen' ? 'pointer'
        : z === 'fin' ? 'ew-resize' : z === 'cuerpo' ? 'move' : 'crosshair';
    if (z && b.f) setTooltip({ x: b.x, y: b.y, contenido: <TooltipFila f={b.f} vista={vista} zona={editable && b.f.tipo !== 'resumen' ? z : null} /> });
    else if (b.relacion !== undefined) {
      const r = vista.relaciones.find((x) => x.indice === b.relacion);
      setTooltip(r ? { x: b.x, y: b.y, contenido: <TooltipRelacion r={r} vista={vista} /> } : null);
    } else setTooltip(null);
  };
  const alPulsar = (ev: React.MouseEvent) => {
    const b = bajo(ev);
    if (!b) return;
    raiz.current?.focus();
    if ('zona' in b && b.f && b.zona) {
      setSeleccion(b.f.id);
      setRelSel(null);
      setTraza(null);
      if (editable && b.f.tipo !== 'resumen' && !estado.ocupado) {
        const tipo = b.zona === 'fin' ? 'fin' : b.zona === 'cuerpo' ? 'cuerpo' : 'vincular';
        setArrastre({ tipo, id: b.f.id, x0: b.x, movido: false, ...(tipo === 'vincular' ? { desde: b.zona === 'vincular-inicio' ? 'inicio' as const : 'fin' as const } : {}) });
      }
      return;
    }
    if (b.relacion !== undefined) {
      setRelSel(b.relacion);
      setSeleccion(null);
      setTraza(null);
      return;
    }
    if (b.f) {
      setSeleccion(b.f.id);
      setRelSel(null);
      setTraza(null);
    }
  };
  const alSoltar = (ev: React.MouseEvent) => {
    const a = arrastre;
    setArrastre(null);
    if (!a || !a.movido || !vista) return;
    const f = vista.filas.find((x) => x.id === a.id);
    if (!f || f.indice < 0) return;
    if (a.tipo === 'fin' && a.serie !== undefined) {
      const c = vista.red.calendarios[vista.red.cal[f.indice] as number] as CalendarioLaboral;
      const d = c.cuenta(c.instante(a.serie + 1)) - c.cuenta(c.instante(f.inicio));
      if (d !== f.duracion && d >= 1) alOperar({ op: 'campo', id: f.id, campo: 'duracion', valor: d });
    } else if (a.tipo === 'cuerpo' && a.serie !== undefined && a.serie !== f.inicio) {
      setConfirmar({
        texto: `Mover ${f.id} al ${textoFecha(a.serie)} fija la restricción «No comenzar antes de» ${textoFecha(a.serie)}: la lógica ya no decide su comienzo si la deja antes.`,
        op: { op: 'restriccion', id: f.id, tipo: 'SNET', fecha: a.serie },
      });
    } else if (a.tipo === 'vincular') {
      const b = bajo(ev);
      if (!b || b.k === undefined || !b.f || b.f.id === f.id) return;
      if (b.f.tipo === 'resumen') {
        setAvisoLocal('Un resumen no entra en el cálculo: vincule sus actividades.');
        return;
      }
      const rect = rectEnPantalla(b.e, b.k, b.f);
      const tipo = tipoVinculo(a.desde ?? 'fin', rect, b.x);
      alOperar({ op: 'vinculo', accion: 'crear', pred: f.id, suc: b.f.id, tipo, desfase: 0 });
    }
  };
  const alDobleClic = (ev: React.MouseEvent) => {
    const b = bajo(ev);
    if (b && b.relacion !== undefined) {
      setRelSel(b.relacion);
      setSeleccion(null);
      setDetalles(true);
    } else if (b && b.f) {
      setSeleccion(b.f.id);
      setDetalles(true);
    }
  };

  // ---------------------------------------------------------- teclado
  const raiz = useRef<HTMLDivElement | null>(null);
  const [editando, setEditando] = useState<{ id: string; col: IdColumna; valor: string } | null>(null);
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const [detalles, setDetalles] = useState(true);
  const recalcular = useCallback(() => setCalculados(datos), [datos]);
  const operar = useCallback((op: OperacionGantt) => {
    setAvisoLocal(null);
    raiz.current?.focus();
    alOperar(op);
  }, [alOperar]);
  const alTeclear = (ev: KeyboardEvent | React.KeyboardEvent) => {
    if (editando || (ev.target as HTMLElement).closest?.('input, select, textarea')) return;
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (editable) alDeshacer(); return; }
    if (ctrl && ev.key.toLowerCase() === 'y') { ev.preventDefault(); if (editable) alRehacer(); return; }
    if (ev.key === 'F9') { ev.preventDefault(); recalcular(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const k = seleccion ? indiceFila.get(seleccion) ?? -1 : -1;
      const nk = Math.max(0, Math.min(filas.length - 1, k + (ev.key === 'ArrowDown' ? 1 : -1)));
      const f = filas[nk];
      if (f) { setSeleccion(f.id); setRelSel(null); setTraza(null); irAFila(f.id); }
      return;
    }
    if (!editable) return;
    if (ev.key === 'Delete') {
      ev.preventDefault();
      if (relacion) operar({ op: 'vinculo', accion: 'borrar', pred: relacion.pred, suc: relacion.suc });
      else if (filaSel) setConfirmar({ texto: `¿Borrar ${filaSel.id} «${filaSel.nombre}», sus vínculos y su incertidumbre? Se puede deshacer.`, op: { op: 'borrar', id: filaSel.id } });
      return;
    }
    if (ev.key === 'Insert') { ev.preventDefault(); operar({ op: 'insertar', despuesDe: seleccion, tipo: 'tarea' }); return; }
    if (ev.altKey && ev.shiftKey && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && seleccion) {
      ev.preventDefault();
      operar({ op: 'nivel', id: seleccion, delta: ev.key === 'ArrowRight' ? 1 : -1 });
      return;
    }
    if (ev.key === 'F2' && filaSel) { ev.preventDefault(); empezarEdicion(filaSel, 'nombre'); }
  };

  // El teclado también cuando el foco se fue a la página (un botón que se deshabilita al pulsarlo lo suelta).
  const teclado = useRef(alTeclear);
  teclado.current = alTeclear;
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      if (raiz.current?.contains(ev.target as Node)) return;
      if (ev.target === document.body || ev.target === document.documentElement) teclado.current(ev);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const valorCelda = (f: FilaGantt, col: IdColumna): string => {
    switch (col) {
      case 'nombre': return f.nombre;
      case 'duracion': return f.duracion === null ? '' : String(f.duracion);
      case 'predecesoras': return f.predecesoras;
      case 'limite': return fecha(f.fechaLimite);
      case 'inicioReal': return fecha(f.inicioReal);
      case 'finReal': return fecha(f.finReal);
      case 'avance': return f.avance === null || f.inicioReal === null && f.finReal === null && f.avance === 0 ? '' : num(100 * f.avance, 0);
      case 'restante': return f.restante === null ? '' : num(f.restante);
      default: return '';
    }
  };
  const empezarEdicion = (f: FilaGantt, col: IdColumna) => {
    if (!editable || estado.ocupado) return;
    if (f.tipo === 'resumen' && col !== 'nombre') {
      setAvisoLocal('En un resumen solo se edita el nombre: sus fechas y su duración salen de sus hijas.');
      return;
    }
    setEditando({ id: f.id, col, valor: valorCelda(f, col) });
  };
  // Enter guarda y, al desaparecer el campo, el blur volvería a guardar: solo cuenta la primera vez.
  const edicionAbierta = useRef<typeof editando>(null);
  edicionAbierta.current = editando;
  const terminarEdicion = (guardar: boolean) => {
    const ed = edicionAbierta.current;
    edicionAbierta.current = null;
    setEditando(null);
    raiz.current?.focus();
    if (!guardar || !ed || !vista) return;
    const f = vista.filas.find((x) => x.id === ed.id);
    if (!f || valorCelda(f, ed.col) === ed.valor) return;
    if (ed.col === 'nombre') operar({ op: 'campo', id: ed.id, campo: 'nombre', valor: ed.valor });
    else if (ed.col === 'duracion') {
      const d = Number(ed.valor.replace(',', '.'));
      if (!Number.isFinite(d) || d < 0) { setAvisoLocal('La duración tiene que ser un número mayor o igual que 0.'); return; }
      operar({ op: 'campo', id: ed.id, campo: 'duracion', valor: d });
    } else if (ed.col === 'predecesoras') {
      const l = leerPredecesoras(ed.valor);
      if (!l.ok) { setAvisoLocal(l.error); return; }
      operar({ op: 'predecesoras', id: ed.id, texto: ed.valor });
    } else if (ed.col === 'limite' || ed.col === 'inicioReal' || ed.col === 'finReal') {
      const s = ed.valor.trim() ? leerFecha(ed.valor) : null;
      if (ed.valor.trim() && s === null) { setAvisoLocal('Escriba la fecha como dd/mm/aaaa.'); return; }
      operar({ op: 'campo', id: ed.id, campo: ed.col === 'limite' ? 'fechaLimite' : ed.col, valor: s });
    } else if (ed.col === 'avance' || ed.col === 'restante') {
      const t = ed.valor.replace('%', '').trim().replace(',', '.');
      const x = t ? Number(t) : null;
      if (x !== null && !Number.isFinite(x)) { setAvisoLocal('Escriba un número.'); return; }
      operar({ op: 'campo', id: ed.id, campo: ed.col === 'avance' ? 'porcentaje' : 'restante', valor: x === null ? null : ed.col === 'avance' ? x / 100 : x });
    }
  };

  // Acciones de las filas, estables (para que las filas memorizadas no se vuelvan a renderizar al desplazar).
  const ultimas = useRef({ empezarEdicion, terminarEdicion });
  ultimas.current = { empezarEdicion, terminarEdicion };
  const accionesFila = useMemo((): AccionesFila => ({
    seleccionar: (id) => { setSeleccion(id); setRelSel(null); setTraza(null); },
    plegar: (id) => setPlegados((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    editar: (valor) => setEditando((e) => (e ? { ...e, valor } : e)),
    empezar: (f, col) => ultimas.current.empezarEdicion(f, col),
    terminar: (guardar) => ultimas.current.terminarEdicion(guardar),
  }), []);

  // ---------------------------------------------------------- columnas del grid
  const pref = useMemo(leerPreferencias, []);
  const [visibles, setVisibles] = useState<IdColumna[]>(pref.columnas ?? VISIBLES_POR_DEFECTO);
  const [anchos, setAnchos] = useState<Record<string, number>>(pref.anchos ?? {});
  const [anchoGrid, setAnchoGrid] = useState<number>(pref.grid ?? 560);
  useEffect(() => guardarPreferencias({ columnas: visibles, anchos, grid: anchoGrid }), [visibles, anchos, anchoGrid]);
  const hayQrsa = !!datos.qrsa && Object.keys(datos.qrsa).length > 0;
  // G3: las columnas de seguimiento aparecen cuando hay fecha de corte o avance.
  const haySeguimiento = datos.modelo.red.fechaCorte !== undefined || datos.modelo.red.actividades.some((a) => a.avance);
  const hayLineaBase = !!vista && vista.lineaBase > 0;
  const columnas = useMemo(() => COLUMNAS.filter((c) => visibles.includes(c.id) && (!c.qrsa || hayQrsa) && (!c.seguimiento || haySeguimiento) && (!c.lineaBase || hayLineaBase)), [visibles, hayQrsa, haySeguimiento, hayLineaBase]);
  const anchoDe = (c: Columna) => anchos[c.id] ?? c.ancho;
  const anchoColumnas = columnas.reduce((s, c) => s + anchoDe(c), 0);
  const anchosColumnas = useMemo(() => columnas.map((c) => anchos[c.id] ?? c.ancho), [columnas, anchos]);
  const redimensionar = (ev: React.MouseEvent, c: Columna) => {
    ev.preventDefault();
    ev.stopPropagation();
    const x0 = ev.clientX;
    const w0 = anchoDe(c);
    const mover = (e: MouseEvent) => setAnchos((a) => ({ ...a, [c.id]: Math.max(24, w0 + e.clientX - x0) }));
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };
  const moverDivisor = (ev: React.MouseEvent) => {
    ev.preventDefault();
    const x0 = ev.clientX;
    const w0 = anchoGrid;
    const mover = (e: MouseEvent) => setAnchoGrid(Math.max(160, Math.min(window.innerWidth - 200, w0 + e.clientX - x0)));
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };

  // ---------------------------------------------------------- buscar
  const [busqueda, setBusqueda] = useState('');
  const buscar = () => {
    if (!vista || !busqueda.trim()) return;
    const t = busqueda.trim().toLowerCase();
    const k0 = seleccion ? vista.filas.findIndex((f) => f.id === seleccion) : -1;
    const orden = [...vista.filas.slice(k0 + 1), ...vista.filas.slice(0, k0 + 1)];
    const f = orden.find((x) => x.id.toLowerCase() === t) ?? orden.find((x) => x.nombre.toLowerCase().includes(t) || x.id.toLowerCase().includes(t));
    if (!f) { setAvisoLocal(`Nada coincide con «${busqueda}».`); return; }
    // Si está plegada dentro de un resumen, se despliega.
    setPlegados((p) => new Set([...p].filter((id) => !f.wbs.startsWith(`${vista.filas.find((x) => x.id === id)?.wbs ?? '\u0000'}.`))));
    setFiltro('todas');
    setSeleccion(f.id);
    setRelSel(null);
    requestAnimationFrame(() => { irAFila(f.id); if (Number.isFinite(f.inicio)) irA(f.inicio); });
  };

  if ('error' in calculo) {
    return (
      <div className="gantt">
        <p className="aviso-error">No se puede calcular el cronograma: {calculo.error}</p>
        {alReleer && <button type="button" onClick={alReleer}>Volver a leer las hojas</button>}
      </div>
    );
  }
  const v = calculo.vista;
  const criticas = v.filas.filter((f) => f.tipo !== 'resumen' && f.critica).length;
  const rojos = v.calidad.filter((c) => c.estado === 'rojo').length;
  const amarillos = v.calidad.filter((c) => c.estado === 'amarillo').length;
  const [k0, k1] = rango;
  const zoomActual = [...ZOOMS].reverse().find((z) => escala.px >= z.px * 0.9) ?? ZOOMS[0];

  return (
    <div className="gantt" ref={raiz} tabIndex={0} onKeyDown={alTeclear}>
      <div className="gantt-herramientas">
        <div className="grupo">
          <button type="button" className="secundario" onClick={ajustarTodoAhora} title="Todo el proyecto en el ancho de la ventana">Ajustar todo</button>
          <button type="button" className="secundario" onClick={() => zoom(escala.px / 1.5)} title="Alejar (Ctrl + rueda)">−</button>
          <select value={zoomActual.id} onChange={(e) => zoom(ZOOMS.find((z) => z.id === e.target.value)?.px ?? 6)} title="Escala de tiempo">
            {ZOOMS.map((z) => <option key={z.id} value={z.id}>{z.etiqueta}</option>)}
          </select>
          <button type="button" className="secundario" onClick={() => zoom(escala.px * 1.5)} title="Acercar (Ctrl + rueda)">+</button>
          <button type="button" className="secundario" onClick={() => irA(hoySerie())}>Hoy</button>
          <button type="button" className="secundario" disabled={!filaSel} onClick={() => { if (filaSel) { irAFila(filaSel.id); irA(filaSel.inicio); } }}>Ir a la seleccionada</button>
        </div>
        <div className="grupo">
          <label title="Cómo se define la ruta crítica (§7.1)">
            Crítica:{' '}
            <select value={definicion} onChange={(e) => setDefinicion(e.target.value as DefinicionCritica)}>
              <option value="holgura">Holgura total ≤ 0</option>
              <option value="masLarga">Ruta más larga</option>
            </select>
          </label>
          <label title="Casi crítica: holgura total hasta este número de días">
            Casi crítica ≤ <input type="number" min={0} max={100} value={umbral} onChange={(e) => setUmbral(Math.max(0, Number(e.target.value) || 0))} style={{ width: 44 }} /> d
          </label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} title="Filtro">
            <option value="todas">Todas las actividades</option>
            <option value="critica">Solo ruta crítica</option>
            <option value="casi">Crítica + casi crítica</option>
          </select>
          <label title="G3: la línea base que se dibuja debajo de cada barra">
            Línea base:{' '}
            <select value={v.lineaBase} onChange={(e) => setLineaBase(Number(e.target.value))}>
              <option value={0}>Ninguna</option>
              {[1, 2, 3].map((k) => <option key={k} value={k}>{`LB${k}${v.lineasBaseGuardadas.includes(k) ? '' : ' (vacía)'}`}</option>)}
            </select>
          </label>
          {editable && (
            <button type="button" className="secundario" disabled={estado.ocupado} title="Guarda las fechas de ahora como esta línea base (en la hoja Lineas_Base)"
              onClick={() => {
                const k = v.lineaBase || 1;
                const op: OperacionGantt = { op: 'lineaBase', numero: k };
                if (v.lineasBaseGuardadas.includes(k)) setConfirmar({ texto: `La línea base ${k} ya existe: ¿reemplazarla por las fechas de ahora? Se puede deshacer.`, op });
                else { operar(op); setLineaBase(k); }
              }}>Guardar línea base</button>
          )}
          <input type="search" placeholder="Buscar ID o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} style={{ width: 140 }} />
        </div>
        {editable && (
          <div className="grupo">
            <button type="button" className="secundario" disabled={estado.ocupado} onClick={() => operar({ op: 'insertar', despuesDe: seleccion, tipo: 'tarea' })} title="Insertar una tarea debajo de la seleccionada (Insert)">+ Tarea</button>
            <button type="button" className="secundario" disabled={estado.ocupado} onClick={() => operar({ op: 'insertar', despuesDe: seleccion, tipo: 'hito' })}>+ Hito</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !filaSel} onClick={() => filaSel && setConfirmar({ texto: `¿Borrar ${filaSel.id} «${filaSel.nombre}», sus vínculos y su incertidumbre? Se puede deshacer.`, op: { op: 'borrar', id: filaSel.id } })} title="Borrar (Supr)">Borrar</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !filaSel} onClick={() => filaSel && operar({ op: 'nivel', id: filaSel.id, delta: -1 })} title="Reducir sangría (Alt+Mayús+←)">⇤</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !filaSel} onClick={() => filaSel && operar({ op: 'nivel', id: filaSel.id, delta: 1 })} title="Aumentar sangría: la de arriba pasa a resumen (Alt+Mayús+→)">⇥</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !filaSel} onClick={() => filaSel && operar({ op: 'mover', id: filaSel.id, delta: -1 })} title="Subir">↑</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !filaSel} onClick={() => filaSel && operar({ op: 'mover', id: filaSel.id, delta: 1 })} title="Bajar">↓</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !estado.deshacer} onClick={alDeshacer} title={estado.deshacer ? `Deshacer: ${estado.deshacer} (Ctrl+Z)` : 'Nada que deshacer'}>↶</button>
            <button type="button" className="secundario" disabled={estado.ocupado || !estado.rehacer} onClick={alRehacer} title={estado.rehacer ? `Rehacer: ${estado.rehacer} (Ctrl+Y)` : 'Nada que rehacer'}>↷</button>
          </div>
        )}
        <div className="grupo">
          <button type="button" className={automatico ? 'secundario' : ''} onClick={() => { setAutomatico(!automatico); if (!automatico) recalcular(); }}
            title="Automático: recalcula en cada cambio. Manual: con F9 o Recalcular.">
            {automatico ? 'Cálculo automático' : 'Cálculo manual'}
          </button>
          {!automatico && <button type="button" disabled={!pendiente} onClick={recalcular}>Recalcular (F9)</button>}
          {alReleer && <button type="button" className="secundario" onClick={alReleer} title="Leer otra vez las hojas (si las cambió en Excel)">Releer hojas</button>}
          {alCorrerQrsa && <button type="button" className="secundario" disabled={estado.ocupado} onClick={alCorrerQrsa} title="Simula el cronograma en el panel (con sus riesgos) y trae la criticidad, el rango P10–P90 y la probabilidad de cumplir cada hito">Correr QRSA</button>}
          <details className="menu-columnas">
            <summary>Columnas y capas</summary>
            <div>
              {COLUMNAS.filter((c) => c.id !== 'diag' && (!c.qrsa || hayQrsa) && (!c.seguimiento || haySeguimiento) && (!c.lineaBase || hayLineaBase)).map((c) => (
                <label key={c.id}><input type="checkbox" checked={visibles.includes(c.id)} onChange={(e) => setVisibles(e.target.checked ? [...visibles, c.id] : visibles.filter((x) => x !== c.id))} /> {c.titulo}</label>
              ))}
              <hr />
              {(['flechas', 'holgura', 'qrsa', 'etiquetas', 'rutas', 'calor'] as const).filter((k) => (k !== 'qrsa' && k !== 'calor') || hayQrsa).map((k) => (
                <label key={k}><input type="checkbox" checked={capas[k]} onChange={(e) => setCapas({ ...capas, [k]: e.target.checked, ...(e.target.checked && k === 'rutas' ? { calor: false } : {}), ...(e.target.checked && k === 'calor' ? { rutas: false } : {}) })} /> {({ flechas: 'Flechas', holgura: 'Línea de holgura', qrsa: 'Rango QRSA (P10–P90)', etiquetas: 'Nombres junto a las barras', rutas: 'Colorear por ruta de holgura', calor: 'Mapa de calor de criticidad (QRSA)' } as const)[k]}</label>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className="gantt-estado">
        <span>Ruta crítica: <strong>{definicion === 'holgura' ? 'holgura total ≤ 0' : 'ruta más larga'}</strong> · {criticas} críticas · fin {textoFecha(v.fin)}{v.fechaMeta !== null ? ` · meta ${textoFecha(v.fechaMeta)}` : ''}{v.fechaCorte !== null ? ` · corte ${textoFecha(v.fechaCorte)}` : ''}</span>
        <span className="tenue">{v.filas.length} filas · {v.relaciones.length} vínculos · calculado en {num(calculo.ms, 1)} ms</span>
        {!automatico && pendiente && <span className="pendiente">Hay cambios sin recalcular (F9)</span>}
        {estado.ocupado && <span className="tenue">Escribiendo en las hojas…</span>}
        {traza && <span className="traza">{traza.titulo ?? (traza.modo === 'impulsora' ? `Ruta impulsora hacia ${traza.id}` : traza.modo === 'arriba' ? `Aguas arriba de ${traza.id}` : `Aguas abajo de ${traza.id}`)} <button type="button" className="enlace" onClick={() => setTraza(null)}>quitar</button></span>}
      </div>
      {(estado.error || avisoLocal) && <p className="aviso-error gantt-mensaje">{avisoLocal ?? estado.error}</p>}
      {!estado.error && !avisoLocal && estado.mensaje && <p className="aviso-ok gantt-mensaje">{estado.mensaje}</p>}
      {confirmar && (
        <div className="gantt-confirmar">
          <span>{confirmar.texto}</span>
          <button type="button" onClick={() => { operar(confirmar.op); setConfirmar(null); }}>Aceptar</button>
          <button type="button" className="secundario" onClick={() => setConfirmar(null)}>Cancelar</button>
        </div>
      )}

      <div className="gantt-cuerpo">
        <div className="gantt-grid" ref={grid} style={{ width: anchoGrid }} onScroll={alDesplazarGrid}>
          <div style={{ height: altoTotal, width: anchoColumnas, position: 'relative' }}>
            <div className="gantt-enc" style={{ width: anchoColumnas }}>
              {columnas.map((c) => (
                <div key={c.id} className={`celda${c.numero ? ' numero' : ''}`} style={{ width: anchoDe(c) }} title={c.titulo}>
                  {c.titulo}
                  <span className="redimensionar" onMouseDown={(e) => redimensionar(e, c)} />
                </div>
              ))}
            </div>
            {filas.slice(k0, k1 + 1).map((f, j) => (
              <FilaGrid key={f.id} f={f} k={k0 + j} columnas={columnas} anchos={anchosColumnas} anchoTotal={anchoColumnas} vista={v}
                seleccionada={f.id === seleccion} atenuada={!!resaltado && !resaltado.actividades.has(f.id)} plegado={plegados.has(f.id)}
                editando={editando && editando.id === f.id ? editando : null} acciones={accionesFila} />
            ))}
          </div>
        </div>
        <div className="gantt-divisor" onMouseDown={moverDivisor} title="Arrastre para cambiar el ancho de la tabla" />
        <div className="gantt-linea" ref={linea} onScroll={alDesplazarLinea}>
          <div style={{ width: anchoTotal, height: altoTotal, position: 'relative' }}>
            <canvas ref={lienzo} className="gantt-lienzo" onMouseMove={alMover} onMouseDown={alPulsar} onMouseUp={alSoltar}
              onMouseLeave={() => { setTooltip(null); if (arrastre) setArrastre(null); }} onDoubleClick={alDobleClic} />
            {tooltip && !arrastre && (
              <div className="gantt-tooltip" style={{
                left: (linea.current?.scrollLeft ?? 0) + Math.min(tooltip.x + 14, tam.ancho - 280),
                top: (linea.current?.scrollTop ?? 0) + Math.min(tooltip.y + 14, tam.alto - 160),
              }}>{tooltip.contenido}</div>
            )}
          </div>
        </div>
      </div>

      <div className="gantt-pie">
        <div className="gantt-detalles">
          <div className="gantt-pie-titulo">
            <button type="button" className="enlace" onClick={() => setDetalles(!detalles)}>{detalles ? '▾' : '▸'} Detalles</button>
          </div>
          {detalles && (relacion
            ? <DetalleRelacion r={relacion} vista={v} editable={editable && !estado.ocupado} alOperar={operar} />
            : filaSel
              ? <DetalleActividad f={filaSel} vista={v} editable={editable && !estado.ocupado} alOperar={operar}
                  alTrazar={(modo) => setTraza({ modo, id: filaSel.id })} alIr={(id) => { setSeleccion(id); setRelSel(null); irAFila(id); }} />
              : <p className="tenue">Seleccione una barra, una fila o una flecha. {editable ? 'Arrastre el borde derecho de una barra para cambiar su duración, el centro para moverla y los conectores de los extremos hasta otra barra para vincularlas.' : ''}</p>)}
        </div>
        <div className="gantt-calidad">
          <div className="gantt-pie-titulo">
            Calidad del cronograma {rojos ? <span className="semaforo rojo">{rojos}</span> : null}{amarillos ? <span className="semaforo amarillo">{amarillos}</span> : null}{!rojos && !amarillos ? <span className="semaforo verde">✓</span> : null}
          </div>
          <ul>
            {v.calidad.map((c) => (
              <li key={c.id}>
                <span className={`punto ${c.estado}`} />
                <button type="button" className="enlace" disabled={c.actividades.length === 0}
                  onClick={() => {
                    const act = new Set(c.actividades);
                    setTraza({ modo: 'criterio', id: c.id, titulo: c.criterio, resaltado: { actividades: act, relaciones: new Set(v.relaciones.filter((r) => act.has(r.pred) && act.has(r.suc)).map((r) => r.indice)) } });
                    const primera = c.actividades[0];
                    if (primera) { setSeleccion(null); irAFila(primera); }
                  }}
                  title={c.detalle}>
                  {c.criterio}
                </button>
                <span className="tenue"> — {c.detalle}</span>
              </li>
            ))}
          </ul>
        </div>
        <Leyenda hayQrsa={hayQrsa} rutas={capas.rutas} calor={capas.calor && hayQrsa} />
      </div>
    </div>
  );
}

interface AccionesFila {
  seleccionar: (id: string) => void;
  plegar: (id: string) => void;
  editar: (valor: string) => void;
  empezar: (f: FilaGantt, col: IdColumna) => void;
  terminar: (guardar: boolean) => void;
}

const FilaGrid = memo(function FilaGrid({ f, k, columnas, anchos, anchoTotal, vista, seleccionada, atenuada, plegado, editando, acciones }: {
  f: FilaGantt; k: number; columnas: Columna[]; anchos: number[]; anchoTotal: number; vista: VistaGantt; seleccionada: boolean; atenuada: boolean;
  plegado: boolean; editando: { col: IdColumna; valor: string } | null; acciones: AccionesFila;
}) {
  return (
    <div className={`gantt-fila${seleccionada ? ' seleccionada' : ''}${f.tipo === 'resumen' ? ' resumen' : ''}${atenuada ? ' atenuada' : ''}`}
      style={{ top: AE + k * G.altoFila, width: anchoTotal }}
      onMouseDown={() => acciones.seleccionar(f.id)}>
      {columnas.map((c, i) => (
        <Celda key={c.id} f={f} c={c} ancho={anchos[i] as number} vista={vista} plegado={plegado}
          alPlegar={() => acciones.plegar(f.id)}
          editando={editando && editando.col === c.id ? editando.valor : null}
          alEditar={acciones.editar}
          alEmpezar={() => { if (c.editable) acciones.empezar(f, c.id); }}
          alTerminar={acciones.terminar} />
      ))}
    </div>
  );
});

function Celda({ f, c, ancho, vista, plegado, alPlegar, editando, alEditar, alEmpezar, alTerminar }: {
  f: FilaGantt; c: Columna; ancho: number; vista: VistaGantt; plegado: boolean; alPlegar: () => void;
  editando: string | null; alEditar: (v: string) => void; alEmpezar: () => void; alTerminar: (guardar: boolean) => void;
}) {
  const clase = `celda${c.numero ? ' numero' : ''}${c.editable ? ' editable' : ''}`;
  if (editando !== null) {
    return (
      <div className={clase} style={{ width: ancho }}>
        <input autoFocus value={editando} onChange={(e) => alEditar(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') alTerminar(true); else if (e.key === 'Escape') alTerminar(false); e.stopPropagation(); }}
          onBlur={() => alTerminar(true)} />
      </div>
    );
  }
  let contenido: ReactNode;
  let titulo: string | undefined;
  switch (c.id) {
    case 'diag': {
      const crit = vista.calidad.filter((x) => f.diagnosticos.includes(x.id));
      if (crit.length) {
        const rojo = crit.some((x) => x.estado === 'rojo');
        contenido = <span className={`diag ${rojo ? 'rojo' : 'amarillo'}`}>{rojo ? '⚠' : '!'}</span>;
        titulo = crit.map((x) => x.criterio).join('\n');
      }
      break;
    }
    case 'wbs': contenido = f.wbs; break;
    case 'id': contenido = f.id; break;
    case 'nombre':
      contenido = (
        <span style={{ paddingLeft: (f.nivel - 1) * 14 }}>
          {f.tipo === 'resumen' ? <button type="button" className="plegar" onMouseDown={(e) => e.stopPropagation()} onClick={alPlegar}>{plegado ? '▸' : '▾'}</button> : <span className="plegar" />}
          {f.nombre}
        </span>
      );
      titulo = f.nombre;
      break;
    case 'duracion': contenido = f.duracion === null ? '' : `${num(f.duracion)} d`; break;
    case 'inicio': contenido = fecha(f.inicio); break;
    case 'fin': contenido = fecha(f.fin); break;
    case 'predecesoras': contenido = f.predecesoras; titulo = f.predecesoras; break;
    case 'sucesoras': contenido = f.sucesoras; titulo = f.sucesoras; break;
    case 'ht': contenido = <span className={f.holguraTotal !== null && f.holguraTotal < 0 ? 'negativo' : ''}>{num(f.holguraTotal)}</span>; break;
    case 'hl': contenido = num(f.holguraLibre); break;
    case 'critica': contenido = f.tipo === 'resumen' || f.estado === 'terminada' ? '' : f.critica ? 'Sí' : 'No'; break;
    case 'ruta': contenido = f.rutaHolgura > 0 ? <span style={{ color: COLORES_RUTA[(f.rutaHolgura - 1) % COLORES_RUTA.length], fontWeight: 600 }}>{f.rutaHolgura}</span> : ''; break;
    case 'restriccion': contenido = f.restriccion ? `${f.restriccion} ${fecha(f.fechaRestriccion)}` : ''; break;
    case 'limite': contenido = fecha(f.fechaLimite); break;
    case 'calendario': contenido = f.calendario; break;
    case 'estado': contenido = f.tipo === 'resumen' && f.avance === null ? '' : f.estado; break;
    case 'avance': contenido = f.avance === null ? '' : `${num(100 * f.avance, 0)} %`; break;
    case 'inicioReal': contenido = fecha(f.inicioReal); break;
    case 'finReal': contenido = fecha(f.finReal); break;
    case 'restante': contenido = f.restante === null ? '' : `${num(f.restante)} d`; break;
    case 'lbInicio': contenido = fecha(f.lineaBase?.inicio ?? null); break;
    case 'lbFin': contenido = fecha(f.lineaBase?.fin ?? null); break;
    case 'variacion': contenido = f.variacion === null ? '' : <span className={f.variacion > 0 ? 'negativo' : ''}>{f.variacion > 0 ? '+' : ''}{num(f.variacion, 0)}</span>; break;
    case 'p80': contenido = f.qrsa ? fecha(f.qrsa.p80) : ''; break;
    case 'criticidad': contenido = f.qrsa ? `${num(100 * f.qrsa.criticidad, 0)} %` : ''; break;
    case 'phito': contenido = f.probabilidadHito ? `${num(100 * f.probabilidadHito.p, 0)} %` : ''; titulo = f.probabilidadHito ? `De terminar a más tardar el ${fecha(f.probabilidadHito.fecha)} (${f.probabilidadHito.fuente})` : undefined; break;
  }
  return (
    <div className={clase} style={{ width: ancho }} title={titulo} onDoubleClick={alEmpezar}>
      {contenido}
    </div>
  );
}

function TooltipFila({ f, vista, zona }: { f: FilaGantt; vista: VistaGantt; zona: string | null }) {
  const alertas = vista.calidad.filter((c) => f.diagnosticos.includes(c.id));
  return (
    <>
      <strong>{f.id} · {f.nombre}</strong>
      <div>{f.tipo === 'hito' ? `Hito: ${fecha(f.inicio)}` : `${fecha(f.inicio)} – ${fecha(f.fin)} (${num(f.duracion)} d)`}</div>
      {f.tipo !== 'resumen' && <div>Holgura total {num(f.holguraTotal)} d · libre {num(f.holguraLibre)} d{f.critica ? ' · crítica' : f.casiCritica ? ' · casi crítica' : ''}</div>}
      {f.predecesoras && <div>Predecesoras: {f.predecesoras}</div>}
      {f.sucesoras && <div>Sucesoras: {f.sucesoras}</div>}
      {f.restriccion && <div>{f.restriccion} {fecha(f.fechaRestriccion)}</div>}
      {f.fechaLimite !== null && <div>Fecha límite {fecha(f.fechaLimite)}</div>}
      {f.lineaBase && <div>Línea base {fecha(f.lineaBase.inicio)} – {fecha(f.lineaBase.fin)}{f.variacion !== null ? ` · variación ${f.variacion > 0 ? '+' : ''}${num(f.variacion, 0)} d` : ''}</div>}
      {f.estado !== 'pendiente' && <div>{f.estado === 'terminada' ? 'Terminada' : 'En curso'}{f.avance !== null ? ` · ${num(100 * f.avance, 0)} %` : ''}{f.inicioReal !== null ? ` · comenzó el ${fecha(f.inicioReal)}` : ''}{f.finReal !== null ? ` · terminó el ${fecha(f.finReal)}` : ''}{f.restante !== null ? ` · le faltan ${num(f.restante)} d` : ''}</div>}
      {f.probabilidadHito && <div><strong>{num(100 * f.probabilidadHito.p, 0)} %</strong> de cumplir el {fecha(f.probabilidadHito.fecha)} ({f.probabilidadHito.fuente})</div>}
      {f.qrsa && <div>QRSA: fin P10 {fecha(f.qrsa.p10)} · P80 {fecha(f.qrsa.p80)} · P90 {fecha(f.qrsa.p90)} · criticidad {num(100 * f.qrsa.criticidad, 0)} %</div>}
      {alertas.map((a) => <div key={a.id} className={a.estado === 'rojo' ? 'negativo' : ''}>⚠ {a.criterio}</div>)}
      {zona && <div className="tenue">{zona === 'fin' ? 'Arrastre para cambiar la duración' : zona === 'cuerpo' ? 'Arrastre para moverla (fija «No comenzar antes de»)' : 'Arrastre hasta otra barra para vincularlas'}</div>}
    </>
  );
}

function TooltipRelacion({ r, vista }: { r: RelacionGantt; vista: VistaGantt }) {
  const n = (id: string) => vista.filas.find((f) => f.id === id)?.nombre ?? id;
  return (
    <>
      <strong>{r.pred} → {r.suc} · {r.tipo}{r.desfase ? ` ${r.desfase > 0 ? '+' : '−'}${Math.abs(r.desfase)}${r.transcurrido ? ' días calendario' : ' días'}` : ''}</strong>
      <div>{n(r.pred)} → {n(r.suc)}</div>
      <div>Holgura de la relación: {num(r.holgura)} d{r.impulsora ? ' · impulsora (fija la fecha de la sucesora)' : ''}</div>
      <div className="tenue">Clic para seleccionarla; Supr para borrarla; doble clic para editarla.</div>
    </>
  );
}

function DetalleActividad({ f, vista, editable, alOperar, alTrazar, alIr }: {
  f: FilaGantt; vista: VistaGantt; editable: boolean; alOperar: (op: OperacionGantt) => void;
  alTrazar: (modo: 'impulsora' | 'arriba' | 'abajo') => void; alIr: (id: string) => void;
}) {
  const [pestana, setPestana] = useState<'general' | 'pred' | 'suc' | 'diag'>('general');
  const preds = vista.relaciones.filter((r) => r.suc === f.id);
  const sucs = vista.relaciones.filter((r) => r.pred === f.id);
  const exp = useMemo(() => explicarCritica(vista, f.id), [vista, f.id]);
  const alertas = vista.calidad.filter((c) => f.diagnosticos.includes(c.id));
  return (
    <div className="detalle">
      <h3>{f.id} · {f.nombre} <span className="tenue">({f.tipo === 'resumen' ? 'resumen' : f.tipo === 'hito' ? 'hito' : 'tarea'}, WBS {f.wbs || '—'})</span></h3>
      <nav className="pestanas pestanas-detalle">
        {([['general', 'General'], ['pred', `Predecesoras (${preds.length})`], ['suc', `Sucesoras (${sucs.length})`], ['diag', 'Diagnóstico']] as const).map(([id, t]) => (
          <button key={id} type="button" className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>{t}</button>
        ))}
      </nav>
      {pestana === 'general' && <General f={f} vista={vista} editable={editable} alOperar={alOperar} />}
      {pestana === 'pred' && <ListaVinculos rels={preds} lado="pred" f={f} vista={vista} editable={editable} alOperar={alOperar} alIr={alIr} />}
      {pestana === 'suc' && <ListaVinculos rels={sucs} lado="suc" f={f} vista={vista} editable={editable} alOperar={alOperar} alIr={alIr} />}
      {pestana === 'diag' && (
        <div>
          {f.tipo !== 'resumen' && exp && (
            <>
              <h4>¿Por qué {exp.critica ? 'es' : 'no es'} crítica?</h4>
              <p>{exp.texto}</p>
              {exp.restriccion && <p className="tenue">Tiene {exp.restriccion}.</p>}
            </>
          )}
          {f.tipo === 'resumen' && <p className="tenue">Un resumen no entra en el cálculo: es crítico si alguna de sus hijas lo es.</p>}
          <div className="botonera">
            <button type="button" className="secundario" onClick={() => alTrazar('impulsora')} disabled={f.tipo === 'resumen'} title="¿Qué cadena controla esta fecha?">Ruta impulsora hacia aquí</button>
            <button type="button" className="secundario" onClick={() => alTrazar('arriba')} disabled={f.tipo === 'resumen'}>Aguas arriba</button>
            <button type="button" className="secundario" onClick={() => alTrazar('abajo')} disabled={f.tipo === 'resumen'}>Aguas abajo</button>
          </div>
          <h4>Alertas de calidad</h4>
          {alertas.length === 0 ? <p className="tenue">Ninguna.</p> : <ul>{alertas.map((a) => <li key={a.id}><span className={`punto ${a.estado}`} /> {a.criterio}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function General({ f, vista, editable, alOperar }: { f: FilaGantt; vista: VistaGantt; editable: boolean; alOperar: (op: OperacionGantt) => void }) {
  const actual = RESTRICCIONES.find((r) => r.nombre === f.restriccion)?.tipo ?? '';
  const [tipo, setTipo] = useState<TipoRestriccion | ''>(actual);
  const [fechaR, setFechaR] = useState(fecha(f.fechaRestriccion));
  const [limite, setLimite] = useState(fecha(f.fechaLimite));
  useEffect(() => { setTipo(actual); setFechaR(fecha(f.fechaRestriccion)); setLimite(fecha(f.fechaLimite)); }, [f.id, actual, f.fechaRestriccion, f.fechaLimite]);
  const calendarios = vista.red.calendarios.map((c) => c.nombre);
  const [aviso, setAviso] = useState<string | null>(null);
  const aplicarRestriccion = () => {
    setAviso(null);
    if (!tipo) { alOperar({ op: 'restriccion', id: f.id, tipo: null, fecha: null }); return; }
    const s = leerFecha(fechaR);
    if (s === null) { setAviso('Escriba la fecha como dd/mm/aaaa.'); return; }
    alOperar({ op: 'restriccion', id: f.id, tipo, fecha: s });
  };
  const resumen = f.tipo === 'resumen';
  return (
    <div className="detalle-general">
      <table className="tabla-estadisticas">
        <tbody>
          <tr><th>Comienzo · fin</th><td>{fecha(f.inicio)} · {fecha(f.fin)}</td></tr>
          <tr><th>Comienzo · fin tardíos</th><td>{fecha(f.inicioTardio)} · {fecha(f.finTardio)}</td></tr>
          <tr><th>Duración</th><td>{num(f.duracion)} días laborables</td></tr>
          {!resumen && <tr><th>Holgura total · libre</th><td><span className={f.holguraTotal !== null && f.holguraTotal < 0 ? 'negativo' : ''}>{num(f.holguraTotal)}</span> · {num(f.holguraLibre)} días</td></tr>}
          {!resumen && <tr><th>Crítica</th><td>{f.critica ? 'Sí' : 'No'}{f.casiCritica ? ' (casi crítica)' : ''}{f.enRutaMasLarga ? ' · en la ruta más larga' : ''}</td></tr>}
          {f.qrsa && <tr><th>QRSA (fin)</th><td>P50 {fecha(f.qrsa.p50)} · P80 {fecha(f.qrsa.p80)} · criticidad {num(100 * f.qrsa.criticidad, 0)} %</td></tr>}
        </tbody>
      </table>
      {!resumen && (
        <div className="campos">
          <label>Calendario{' '}
            <select disabled={!editable} value={f.calendario} onChange={(e) => alOperar({ op: 'campo', id: f.id, campo: 'calendario', valor: e.target.value })}>
              {calendarios.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Restricción{' '}
            <select disabled={!editable} value={tipo} onChange={(e) => setTipo(e.target.value as TipoRestriccion | '')}>
              <option value="">Lo antes posible</option>
              {RESTRICCIONES.map((r) => <option key={r.tipo} value={r.tipo}>{r.nombre}</option>)}
            </select>
          </label>
          {tipo && <input disabled={!editable} value={fechaR} placeholder="dd/mm/aaaa" onChange={(e) => setFechaR(e.target.value)} style={{ width: 92 }} />}
          <button type="button" className="secundario" disabled={!editable || (tipo === actual && (tipo === '' || fechaR === fecha(f.fechaRestriccion)))} onClick={aplicarRestriccion}>Aplicar</button>
          <label>Fecha límite{' '}
            <input disabled={!editable} value={limite} placeholder="dd/mm/aaaa" onChange={(e) => setLimite(e.target.value)} style={{ width: 92 }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onBlur={() => {
                if (limite === fecha(f.fechaLimite)) return;
                const s = limite.trim() ? leerFecha(limite) : null;
                if (limite.trim() && s === null) { setAviso('Escriba la fecha como dd/mm/aaaa.'); return; }
                alOperar({ op: 'campo', id: f.id, campo: 'fechaLimite', valor: s });
              }} />
          </label>
          <button type="button" className="secundario" disabled={!editable} onClick={() => alOperar({ op: 'hito', id: f.id })}>{f.tipo === 'hito' ? 'Convertir en tarea' : 'Convertir en hito'}</button>
        </div>
      )}
      {aviso && <p className="aviso-error">{aviso}</p>}
    </div>
  );
}

function ListaVinculos({ rels, lado, f, vista, editable, alOperar, alIr }: {
  rels: RelacionGantt[]; lado: 'pred' | 'suc'; f: FilaGantt; vista: VistaGantt; editable: boolean; alOperar: (op: OperacionGantt) => void; alIr: (id: string) => void;
}) {
  const [nuevo, setNuevo] = useState({ id: '', tipo: 'FC' as TipoRelacion, desfase: '0' });
  const nombre = (id: string) => vista.filas.find((x) => x.id === id)?.nombre ?? '';
  return (
    <div>
      {rels.length === 0 ? <p className="tenue">{lado === 'pred' ? 'Sin predecesoras.' : 'Sin sucesoras.'}</p> : (
        <table className="tabla-resumen tabla-vinculos">
          <thead><tr><th>{lado === 'pred' ? 'Predecesora' : 'Sucesora'}</th><th>Tipo</th><th>Desfase</th><th>Holgura de la relación</th><th>Impulsora</th><th /></tr></thead>
          <tbody>
            {rels.map((r) => {
              const otra = lado === 'pred' ? r.pred : r.suc;
              return (
                <tr key={r.indice}>
                  <td><button type="button" className="enlace" onClick={() => alIr(otra)}>{otra}</button> <span className="tenue">{nombre(otra)}</span></td>
                  <td>{r.tipo}</td>
                  <td>{r.desfase ? `${r.desfase > 0 ? '+' : '−'}${Math.abs(r.desfase)} ${r.transcurrido ? 'dc' : 'd'}` : ''}</td>
                  <td>{num(r.holgura)} d</td>
                  <td>{r.impulsora ? 'Sí' : ''}</td>
                  <td>{editable && <button type="button" className="enlace" onClick={() => alOperar({ op: 'vinculo', accion: 'borrar', pred: r.pred, suc: r.suc })}>borrar</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editable && f.tipo !== 'resumen' && (
        <div className="campos">
          <input placeholder={lado === 'pred' ? 'ID de la predecesora' : 'ID de la sucesora'} value={nuevo.id} onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })} style={{ width: 110 }} />
          <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoRelacion })}>{TIPOS_REL.map((t) => <option key={t}>{t}</option>)}</select>
          <input type="number" value={nuevo.desfase} onChange={(e) => setNuevo({ ...nuevo, desfase: e.target.value })} style={{ width: 56 }} title="Desfase en días laborables" />
          <button type="button" className="secundario" disabled={!nuevo.id.trim()} onClick={() => {
            const otro = nuevo.id.trim();
            alOperar({ op: 'vinculo', accion: 'crear', pred: lado === 'pred' ? otro : f.id, suc: lado === 'pred' ? f.id : otro, tipo: nuevo.tipo, desfase: Number(nuevo.desfase) || 0 });
            setNuevo({ id: '', tipo: 'FC', desfase: '0' });
          }}>Agregar</button>
        </div>
      )}
    </div>
  );
}

function DetalleRelacion({ r, vista, editable, alOperar }: { r: RelacionGantt; vista: VistaGantt; editable: boolean; alOperar: (op: OperacionGantt) => void }) {
  const [tipo, setTipo] = useState<TipoRelacion>(r.tipo);
  const [desfase, setDesfase] = useState(String(r.desfase));
  const [transcurrido, setTranscurrido] = useState(r.transcurrido);
  useEffect(() => { setTipo(r.tipo); setDesfase(String(r.desfase)); setTranscurrido(r.transcurrido); }, [r]);
  const n = (id: string) => vista.filas.find((f) => f.id === id)?.nombre ?? id;
  return (
    <div className="detalle">
      <h3>Vínculo {r.pred} → {r.suc}</h3>
      <p className="tenue">{n(r.pred)} → {n(r.suc)}</p>
      <p>Holgura de la relación: <strong>{num(r.holgura)} días</strong>{r.impulsora ? ' — es impulsora: fija la fecha de la sucesora.' : ' — no es impulsora: la sucesora la fija otra relación o una restricción.'}{r.masLarga ? ' Está en la ruta más larga.' : ''}</p>
      <div className="campos">
        <label>Tipo <select disabled={!editable} value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacion)}>{TIPOS_REL.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Desfase <input disabled={!editable} type="number" value={desfase} onChange={(e) => setDesfase(e.target.value)} style={{ width: 60 }} /> días</label>
        <label><input disabled={!editable} type="checkbox" checked={transcurrido} onChange={(e) => setTranscurrido(e.target.checked)} /> calendario (transcurridos)</label>
        <button type="button" disabled={!editable} onClick={() => alOperar({ op: 'vinculo', accion: 'editar', pred: r.pred, suc: r.suc, tipo, desfase: Number(desfase) || 0, transcurrido })}>Guardar</button>
        <button type="button" className="secundario" disabled={!editable} onClick={() => alOperar({ op: 'vinculo', accion: 'borrar', pred: r.pred, suc: r.suc })}>Borrar (Supr)</button>
      </div>
    </div>
  );
}

function Leyenda({ hayQrsa, rutas, calor }: { hayQrsa: boolean; rutas: boolean; calor: boolean }) {
  const barra = (color: string, extra?: React.CSSProperties) => <span className="ley-barra" style={{ background: color, ...extra }} />;
  return (
    <div className="gantt-leyenda">
      <div className="gantt-pie-titulo">Leyenda</div>
      <ul>
        <li>{barra(COLORES.tarea)} Tarea</li>
        <li>{barra(COLORES.critica)} Crítica</li>
        <li>{barra(COLORES.casiCritica)} Casi crítica</li>
        <li>{barra(COLORES.critica, { outline: `2px solid ${COLORES.negativa}`, backgroundImage: 'repeating-linear-gradient(-45deg, transparent 0 3px, rgba(255,255,255,.55) 3px 5px)' })} Holgura negativa</li>
        <li><span className="ley-rombo" /> Hito</li>
        <li><span className="ley-resumen" /> Resumen</li>
        <li><span className="ley-linea" style={{ borderColor: COLORES.holgura }} /> Holgura total (hasta el fin tardío)</li>
        <li><span className="ley-linea" style={{ borderColor: COLORES.flechaImpulsora }} /> Vínculo impulsor en la ruta crítica</li>
        <li><span className="ley-linea" style={{ borderColor: COLORES.flecha }} /> Vínculo</li>
        <li><span className="ley-vertical" style={{ borderColor: COLORES.hoy }} /> Hoy · <span className="ley-vertical punteada" style={{ borderColor: COLORES.limites }} /> inicio y fin · <span className="ley-vertical punteada" style={{ borderColor: COLORES.meta }} /> meta</li>
        <li><span className="ley-limite" /> Fecha límite · <span className="ley-restriccion" /> restricción</li>
        <li><span className="ley-noLab" /> No laborable o festivo</li>
        <li><span className="ley-barra" style={{ background: COLORES.lineaBase, height: 3 }} /> Línea base</li>
        <li><span className="ley-barra" style={{ background: COLORES.tarea, boxShadow: 'inset 0 0 0 3px #4472C4, inset 0 0 0 10px rgba(0,0,0,.38)' }} /> Avance · <span className="ley-barra" style={{ background: '#8EA9DB' }} /> terminada · <span className="ley-vertical punteada" style={{ borderColor: COLORES.corte, borderLeftWidth: 3 }} /> fecha de corte</li>
        {hayQrsa && <li><span className="ley-qrsa" /> Rango QRSA del fin: P10–P90, marca en P80</li>}
        {rutas && <li>Rutas de holgura: {COLORES_RUTA.slice(0, 5).map((c, i) => <span key={c} style={{ color: c, fontWeight: 700, marginRight: 4 }}>{i + 1}</span>)}… (gris: más allá de la 10)</li>}
        {calor && <li>Criticidad: {[0, 0.25, 0.5, 0.75, 1].map((x) => <span key={x} className="ley-barra" style={{ background: colorCalor(x), width: 14, marginRight: 2 }} title={`${x * 100} %`} />)} 0 % → 100 %</li>}
      </ul>
    </div>
  );
}
