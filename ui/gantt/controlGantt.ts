/**
 * El lado del panel del Gantt (G2): lee las hojas, aplica cada edición que
 * pide la ventana (validada en `edicionGantt.ts`), la escribe en Excel y
 * lleva el deshacer y rehacer de la sesión. El del panel está en
 * `controlPanel.ts`; la pestaña Cronograma le deja la última simulación (para
 * las columnas QRSA).
 */

import { leerCronograma, type LecturaCronograma, type MatrizHoja } from '../../excel/cronogramaHojas.ts';
import { aplicarCambios, aplicarOperacion, HistorialGantt, hojasDe, huellaHojas, type CambioHoja, type OperacionGantt } from '../../excel/edicionGantt.ts';
import { datosGanttDe, type DatosGantt, type EstadoEdicion } from '../../excel/gantt.ts';
import { cambiosDe, erroresTrasGuardar, leerEditores, revisarPedido, type DatosEditores, type PedidoGuardar } from '../../excel/editoresCronograma.ts';

export interface RespuestaGantt {
  gantt?: DatosGantt;
  estadoGantt: EstadoEdicion;
  /** 06/10: lo de los editores de calendarios, riesgos y ramas (se manda siempre: deshacer en el Gantt también los refresca). */
  editores?: DatosEditores;
}

export class ControlGantt {
  readonly historial = new HistorialGantt();
  qrsa: DatosGantt['qrsa'];
  distribucionFin: DatosGantt['distribucionFin'];
  private leerHojas: () => Promise<Record<string, MatrizHoja | undefined>>;
  private escribir: (cambios: readonly CambioHoja[]) => Promise<void>;

  /** Sin Office.js: el panel le pasa cómo leer las hojas y cómo escribir los cambios (`controlPanel.ts`). */
  constructor(leer: () => Promise<Record<string, MatrizHoja | undefined>>, escribir: (cambios: readonly CambioHoja[]) => Promise<void>) {
    this.leerHojas = leer;
    this.escribir = escribir;
  }

  private datosDe(l: LecturaCronograma): DatosGantt | null {
    return datosGanttDe(l, this.qrsa, this.distribucionFin);
  }

  private estado(extra: Partial<EstadoEdicion> = {}): EstadoEdicion {
    return { deshacer: this.historial.puedeDeshacer, rehacer: this.historial.puedeRehacer, mensaje: null, error: null, ocupado: false, ...extra };
  }

  private respuesta(l: LecturaCronograma, extra: Partial<EstadoEdicion> = {}, hojas?: Readonly<Record<string, MatrizHoja | undefined>>): RespuestaGantt {
    const editores = hojas ? { editores: leerEditores(hojas) } : {};
    const gantt = this.datosDe(l);
    if (!gantt) {
      const e = l.errores[0];
      return { ...editores, estadoGantt: this.estado({ ...extra, error: `El cronograma tiene errores: ${e ? `${e.hoja}${e.fila > 0 ? `, ${e.columna}${e.fila}` : ''}: ${e.mensaje}` : 'no se pudo leer'}${l.errores.length > 1 ? ` (y ${l.errores.length - 1} más; véalos en la pestaña Cronograma)` : ''}.` }) };
    }
    return { gantt, ...editores, estadoGantt: this.estado(extra) };
  }

  /** Lee las hojas y arma lo que se manda a la ventana. */
  async leer(extra: Partial<EstadoEdicion> = {}): Promise<RespuestaGantt> {
    const hojas = await this.leerHojas();
    return this.respuesta(leerCronograma(hojas), extra, hojas);
  }

  /** Aplica una edición: se lee el libro de nuevo (pudo cambiar a mano), se valida y se escribe. */
  async operar(op: OperacionGantt): Promise<RespuestaGantt> {
    const hojas = await this.leerHojas();
    const r = aplicarOperacion(hojas, op);
    if (!r.ok) return { estadoGantt: this.estado({ error: r.error }) };
    const tocadas = hojasDe(r.cambios);
    await this.escribir(r.cambios);
    this.historial.registrar(r.descripcion, r.cambios, huellaHojas(hojas, tocadas), huellaHojas(r.hojas, tocadas));
    return this.respuesta(r.lectura, { mensaje: `${r.descripcion}: escrito en las hojas.`, ...(r.seleccion ? { seleccion: r.seleccion } : {}) }, r.hojas);
  }

  /**
   * 06/10: guarda lo de un editor (calendarios, riesgos o ramas). Se lee el
   * libro de nuevo, se revisa con el mismo lector que la simulación y se
   * escribe; queda en el mismo historial que el Gantt (se puede deshacer).
   */
  async guardarEditor(pedido: PedidoGuardar): Promise<RespuestaGantt> {
    const hojas = await this.leerHojas();
    const actuales = leerEditores(hojas);
    const avisos = revisarPedido(pedido, actuales.actividades.map((a) => a.id));
    if (avisos.length) return { editores: actuales, estadoGantt: this.estado({ error: `No se guardó: ${avisos.join(' ')}` }) };
    const cambios = cambiosDe(hojas, pedido);
    const errores = erroresTrasGuardar(hojas, cambios);
    if (errores.length) {
      const t = errores.slice(0, 3).map((e) => `${e.hoja}${e.fila > 0 ? `, ${e.columna}${e.fila}` : ''}: ${e.mensaje}`).join(' · ');
      return { editores: actuales, estadoGantt: this.estado({ error: `No se guardó, porque la hoja quedaría con errores: ${t}${errores.length > 3 ? ` (y ${errores.length - 3} más)` : ''}.` }) };
    }
    const descripcion = { calendarios: 'Editar los calendarios', riesgos: 'Editar los riesgos', ramas: 'Editar las ramas' }[pedido.tipo];
    const tocadas = hojasDe(cambios);
    const nuevas = aplicarCambios(hojas, cambios);
    await this.escribir(cambios);
    this.historial.registrar(descripcion, cambios, huellaHojas(hojas, tocadas), huellaHojas(nuevas, tocadas));
    return this.respuesta(leerCronograma(nuevas), { mensaje: `${descripcion}: escrito en las hojas ${tocadas.join(', ')}.` }, nuevas);
  }

  async deshacer(): Promise<RespuestaGantt> {
    return this.repetir('deshacer');
  }

  async rehacer(): Promise<RespuestaGantt> {
    return this.repetir('rehacer');
  }

  private async repetir(que: 'deshacer' | 'rehacer'): Promise<RespuestaGantt> {
    const v = que === 'deshacer' ? this.historial.verDeshacer() : this.historial.verRehacer();
    if (!v) return { estadoGantt: this.estado({ error: que === 'deshacer' ? 'Nada que deshacer.' : 'Nada que rehacer.' }) };
    const hojas = await this.leerHojas();
    if (huellaHojas(hojas, v.hojas) !== v.huella) {
      this.historial.vaciar();
      return this.respuesta(leerCronograma(hojas), {
        error: `Las hojas ${v.hojas.join(', ')} cambiaron fuera del Gantt después de esa edición: no se puede ${que} con seguridad. El historial se vació; corrija a mano si hace falta.`,
      }, hojas);
    }
    if (que === 'deshacer') this.historial.deshacer();
    else this.historial.rehacer();
    await this.escribir(v.cambios);
    const nuevas = aplicarCambios(hojas, v.cambios);
    return this.respuesta(leerCronograma(nuevas), { mensaje: `${que === 'deshacer' ? 'Deshecho' : 'Rehecho'}: ${v.descripcion}.` }, nuevas);
  }
}
