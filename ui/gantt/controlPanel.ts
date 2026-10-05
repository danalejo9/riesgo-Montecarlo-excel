/** El control del Gantt del panel, con Excel de verdad (uno solo para todo el panel). */

import { aplicarCambiosEnLibro, leerHojasCronograma } from '../../excel/cronogramaLibro.ts';
import { ControlGantt } from './controlGantt.ts';

export const controlGantt = new ControlGantt(leerHojasCronograma, aplicarCambiosEnLibro);

/** Eventos entre la pestaña Cronograma y el panel (que es el dueño de la ventana). */
export const ABRIR_GANTT = 'riesgo:abrir-gantt';
export const REFRESCAR_GANTT = 'riesgo:refrescar-gantt';
