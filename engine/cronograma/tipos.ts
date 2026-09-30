/**
 * El modelo del cronograma (bloque P, `docs/PLAN_CRONOGRAMA_QSRA.md` §3).
 * Sin Office.js: lo mismo sirve para la hoja «Actividades», para un XML de
 * MS Project o para un XER de P6 (P4), que solo tienen que traducirse aquí.
 *
 * Unidades: las duraciones y los retardos están en **días laborables** del
 * calendario del proyecto. Las fechas son números de serie de Excel.
 */

/** Tipo de relación: fin‑comienzo, comienzo‑comienzo, fin‑fin, comienzo‑fin. */
export type TipoRelacion = 'FS' | 'SS' | 'FF' | 'SF';

export interface Relacion {
  /** El ID de la actividad predecesora, tal como está en la tabla. */
  predecesora: string;
  tipo: TipoRelacion;
  /** Días laborables; negativo = adelanto (*lead*). */
  retardo: number;
}

export interface TresPuntos {
  min: number;
  masProbable: number;
  max: number;
}

export interface Actividad {
  id: string;
  nombre: string;
  /** Días laborables; 0 = hito. */
  duracion: number;
  predecesoras: Relacion[];
  /** Incertidumbre de la duración (P3). `undefined` = duración fija. */
  tresPuntos?: TresPuntos;
  /** Categoría o frente, para asignar incertidumbre en bloque (P3). */
  categoria?: string;
  /** Costo que se paga por cada día que dura la actividad (P5): crece si se alarga. */
  costoPorDia?: number;
  /** Costo que no depende de la duración (materiales, equipos comprados) (P5). */
  costoFijo?: number;
  /** «Inicio no antes de» (fecha de serie de Excel). */
  inicioNoAntesDe?: number;
  /** «Inicio no después de»: no mueve la actividad, pero reduce su holgura (y puede volverla negativa). */
  inicioNoDespuesDe?: number;
  /** «Terminar no antes de»: la actividad no puede terminar antes de esa fecha. */
  terminarNoAntesDe?: number;
  /** «Terminar no después de» (o fecha límite): reduce la holgura, como `inicioNoDespuesDe`. */
  terminarNoDespuesDe?: number;
  /** Avance: fechas reales y trabajo que queda (con la fecha de corte del cronograma). */
  inicioReal?: number;
  finReal?: number;
  /** Fracción completada (0–1). */
  completado?: number;
  /** Días laborables que quedan; si falta, `duracion × (1 − completado)`. */
  restante?: number;
  /** Fila de la hoja de la que salió, para los mensajes. */
  fila?: number;
}

export interface Calendario {
  /** Índice 0 = domingo … 6 = sábado, como `Date.getUTCDay`. */
  laborables: readonly boolean[];
  /** Días no laborables sueltos (festivos), como números de serie. */
  festivos: ReadonlySet<number>;
}

export interface Cronograma {
  /** Fecha de inicio del proyecto (serie de Excel). */
  inicio: number;
  calendario: Calendario;
  actividades: Actividad[];
  /** Fecha de corte (*data date*): el trabajo que queda empieza ese día o después. */
  fechaCorte?: number;
  /** Costo indirecto del proyecto por día laborable que dura (administración, vigilancia, alquileres) (P5). */
  costoIndirectoDia?: number;
}

/** Un problema al leer o al calcular, con dónde está, para enseñarlo tal cual. */
export interface ProblemaCronograma {
  gravedad: 'error' | 'aviso';
  mensaje: string;
  /** ID de la actividad, si aplica. */
  actividad?: string;
  /** Hoja y fila, si aplica. */
  hoja?: string;
  fila?: number;
}
