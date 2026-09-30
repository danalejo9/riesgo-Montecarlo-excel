/**
 * Pestaña «Cronograma» (bloque P): plantilla, camino crítico determinista
 * (P1), chequeo de salud con semáforo (P2) y Monte Carlo del plazo con los
 * riesgos de plazo (P3). Todo el cálculo está en `engine/cronograma/`; aquí
 * solo se lee el libro, se enseña y se escribe.
 */

import { useRef, useState } from 'react';

import { guardarPlanCronograma } from '../excel/planCronograma.ts';
import {
  calcularCPM, compararMitigacion, completarRangos, escenarioDespues, hojaMitigacion, narrativaMitigacion, tieneMitigacion,
  type ComparacionMitigacion, hojaGantt, hojaPlazoSimulado, importarCronograma, verificarContraFuente,
  type CronogramaImportado, type Verificacion, hojaSimulacionPlazo, vistaGantt, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, narrativaPlazo, revisarSalud,
  simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO,
  type Cronograma as ModeloCronograma, type FormaDuracion, type ImpactoRiesgo, type InformeSalud, type ProblemaCronograma,
  type ResultadoCPM, type ResultadoSimulacionPlazo, type RiesgoPlazo, type Semaforo,
  reservaContingencia, type NivelReserva, type SinRiesgos,
  riesgosActivos, evaluarRegistro, hojaRegistro, colorDe, type Registro,
  leerRangosTipo, publicarPlan, EJEMPLOS_SECTOR, hojasDeEjemplo, type IdSector,
  compararEscenarios, hojaEscenarios, leerEscenarios, narrativaEscenarios, plantillaEscenarios, type ComparacionEscenarios, agregarInstantanea, hojaSeguimiento, exportarMspdi, exportarXer, aWindows1252, instantaneaDe, leerSeguimiento, serieLocal, tendencia, type Instantanea,
} from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { textoMoneda } from '../engine/modelo/moneda.ts';
import { tieneCapacidad } from '../engine/licencia/capacidades.ts';
import {
  escribirCeldasActividades, escribirCronogramaImportado, escribirEjemploSector, escribirHojaEscenarios, escribirPlantillaEscenarios, escribirHojaGantt, escribirHojaSeguimiento, escribirHojaSimulacion, escribirPlantillaCronograma,
  escribirResultadoCPM, leerHojaSeguimiento, leerHojasCronograma, escribirPlantillaRangosTipo, escribirHojaRegistro,
} from '../excel/cronograma.ts';
import { codificarJson } from '../excel/codificacion.ts';
import { plantillaDelLibro } from '../excel/almacenPlantilla.ts';
import { datosInformeCronograma } from '../excel/informeCronograma.ts';
import { codificarInforme } from '../excel/informeImprimible.ts';
import { abrirVentana, ventanaAbierta } from '../excel/ventana.ts';
import { Plegable } from './Plegable.tsx';
import { ControlesVistaPrevia, TarjetaVistaPrevia, useVistaPrevia } from './VistaPreviaPlazo.tsx';
import { abrirEnNavegador } from './Resultados.tsx';
import { descargarDirecto, esEscritorio, type ArchivoDescarga } from './descarga.ts';
import { BarrasConvergencia, HistogramaFechas, MatrizConsolidada, MatrizRiesgos, NubeCostoPlazo, TendenciaPlazo } from './graficosCronograma.tsx';
import { crearHilosPlazo } from './motor/plazoNavegador.ts';
import { hilosEfectivos, leerPreferenciaHilos } from './motor/preferencias.ts';
import { textosCronograma as T } from './textos/es.ts';
import { PrimerUso } from './PrimerUsoCronograma.tsx';

type Calculado = Extract<ResultadoCPM, { ok: true }> & { hoja: string };
interface Simulado {
  r: ResultadoSimulacionPlazo;
  impacto?: { porRiesgo: ImpactoRiesgo[]; sinRiesgos: SinRiesgos };
  narrativa: string[];
  hoja: string;
  hilos: number;
  escenario: 'antes' | 'despues';
  comparacion?: { cmp: ComparacionMitigacion; narrativa: string[] };
}

const ITERACIONES = [1000, 5000, 10_000, 50_000];
const PAGINA_GANTT = 'gantt.html';
/** Caracteres de la vista codificada que se meten en la URL de la ventana; más, por mensaje. */
const LIMITE_URL = 24_000;
const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

export function Cronograma({ alFallar }: { alFallar: (e: unknown) => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<ProblemaCronograma[]>([]);
  const [resultado, setResultado] = useState<Calculado | null>(null);
  const [salud, setSalud] = useState<InformeSalud | null>(null);
  const [datos, setDatos] = useState<{ cron: ModeloCronograma; riesgos: RiesgoPlazo[]; todos: RiesgoPlazo[] } | null>(null);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [iteraciones, setIteraciones] = useState(OPCIONES_PLAZO_POR_DEFECTO.iteraciones);
  const [forma, setForma] = useState<FormaDuracion>(OPCIONES_PLAZO_POR_DEFECTO.forma);
  const cancelado = useRef(false);
  const [importado, setImportado] = useState<{ imp: CronogramaImportado; ver: Verificacion; confirmar: boolean } | null>(null);
  // W6: el ejemplo por sector elegido y si falta confirmar que reemplaza lo que hay.
  const [sector, setSector] = useState<IdSector>('vivienda');
  const [confirmarEjemplo, setConfirmarEjemplo] = useState(false);
  // W7: la última comparación de escenarios.
  const [queSi, setQueSi] = useState<{ cmp: ComparacionEscenarios; narrativa: string[]; hoja: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [pctMenos, setPctMenos] = useState(10);
  const [pctMas, setPctMas] = useState(25);
  const [escenario, setEscenario] = useState<'antes' | 'despues' | 'comparar'>('antes');
  const [seguimiento, setSeguimiento] = useState<Instantanea[]>([]);
  // V11: la vista previa mientras se edita (preferencia de este equipo).
  const previa = useVistaPrevia(ocupado, forma);

  if (!tieneCapacidad('cronograma')) {
    return <section><p className="aviso-linea">{T.sinCapacidad}</p></section>;
  }

  const calcular = async () => {
    setOcupado(T.calculando);
    setNota(null);
    setSimulado(null);
    try {
      const hojas = await leerHojasCronograma();
      setSeguimiento(leerSeguimiento(hojas.seguimiento));
      const lectura = leerCronograma(hojas.actividades, hojas.calendario, hojas.calendarios, hojas.clima, hojas.hitos);
      const cron = lectura.cronograma;
      if (!cron) {
        setProblemas(lectura.problemas);
        setResultado(null);
        setSalud(null);
        setDatos(null);
        return;
      }
      const r = calcularCPM(cron);
      if (!r.ok) {
        setProblemas([...lectura.problemas, ...r.problemas]);
        setResultado(null);
        setSalud(null);
        setDatos(null);
        return;
      }
      const riesgos = leerRiesgosPlazo(hojas.riesgos, cron.actividades);
      // W5: el plan, para lo que enseña RIESGO.CRONOGRAMA en el modelo de costos.
      void guardarPlanCronograma(publicarPlan(cron)).catch(() => undefined);
      const hoja = await escribirResultadoCPM(r);
      const vista = vistaGantt(cron.actividades, r.filas, r.fechaFinProyecto, undefined, cron.fechaCorte);
      await escribirHojaGantt(hojaGantt(vista));
      ventanaAbierta(PAGINA_GANTT)?.enviar(vista);
      setProblemas([...lectura.problemas, ...r.avisos, ...riesgos.problemas]);
      setResultado({ ...r, hoja });
      setSalud(revisarSalud(cron.actividades, r.filas));
      const bien = !riesgos.problemas.some((p) => p.gravedad === 'error');
      // V10: se simulan los activos; el registro los enseña todos.
      setDatos(bien ? { cron, riesgos: riesgosActivos(riesgos.riesgos), todos: riesgos.riesgos } : null);
      if (bien && riesgos.riesgos.length > 0) {
        const reg = evaluarRegistro({ riesgos: riesgos.riesgos, actividades: cron.actividades, dias: r.duracionProyecto, hoy: serieLocal(new Date()) });
        setRegistro(reg);
        await escribirHojaRegistro(hojaRegistro(reg));
      } else setRegistro(null);
      if (previa.prefs.activa) setTimeout(previa.tras, 0);
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  };

  const simular = async () => {
    if (!datos) return;
    cancelado.current = false;
    setOcupado(T.simulando(0, iteraciones));
    // P3b: tantos hilos como diga la configuración; sin Web Workers, en el hilo del panel.
    const hilos = crearHilosPlazo(hilosEfectivos(leerPreferenciaHilos()));
    try {
      const op = {
        iteraciones, forma, semilla: OPCIONES_PLAZO_POR_DEFECTO.semilla, ceder,
        debeCancelar: () => cancelado.current,
        alAvanzar: (h: number, t: number) => setOcupado(T.simulando(h, t)),
      };
      const simular: typeof simularPlazo = (c, rs, o) =>
        hilos ? simularPlazoEnParalelo(c, rs, o, hilos.para(c, rs, o), hilos.hilos) : simularPlazo(c, rs, o);
      // V1: el escenario de riesgos. «Comparar» enseña el de antes y añade la comparación.
      const usado = escenario === 'despues' ? escenarioDespues(datos.cron, datos.riesgos) : { cronograma: datos.cron, riesgos: datos.riesgos };
      const r = await simular(usado.cronograma, usado.riesgos, op);
      let impacto: Simulado['impacto'];
      if (!r.cancelada && (usado.riesgos.length > 0 || usado.cronograma.clima)) {
        setOcupado(T.midiendoRiesgos(0, usado.riesgos.length + 1));
        const imp = await impactoDeRiesgos(usado.cronograma, usado.riesgos, r, {
          ...op, alAvanzar: (h, t) => setOcupado(T.midiendoRiesgos(h, t)),
        }, simular);
        if (!cancelado.current) impacto = imp;
      }
      let comparacion: Simulado['comparacion'];
      if (escenario === 'comparar' && !r.cancelada && !cancelado.current) {
        setOcupado(T.comparando(0, 1));
        const cmp = await compararMitigacion(datos.cron, datos.riesgos, { ...op, alAvanzar: (h, t) => setOcupado(T.comparando(h, t)) }, simular, r);
        if (!cancelado.current) {
          const texto = narrativaMitigacion(cmp);
          await escribirHojaSimulacion(hojaMitigacion(cmp, texto));
          comparacion = { cmp, narrativa: texto };
        }
      }
      const narrativa = [
        ...(escenario === 'despues' ? [T.escenarioDespuesAviso] : []),
        ...narrativaPlazo(r, impacto, salud ?? undefined),
      ];
      const hoja = await escribirHojaSimulacion(hojaSimulacionPlazo(r, impacto, narrativa), r.cancelada ? undefined : hojaPlazoSimulado(r));
      if (resultado) {
        const vista = vistaGantt(datos.cron.actividades, resultado.filas, resultado.fechaFinProyecto, r, datos.cron.fechaCorte);
        await escribirHojaGantt(hojaGantt(vista));
        ventanaAbierta(PAGINA_GANTT)?.enviar(vista);
      }
      if (impacto && datos.todos.length > 0) {
        const reg = evaluarRegistro({
          riesgos: datos.todos, actividades: datos.cron.actividades, impacto: impacto.porRiesgo, dias: r.determinista.dias,
          ...(r.costos ? { costo: r.costos.determinista } : {}), hoy: serieLocal(new Date()),
        });
        setRegistro(reg);
        await escribirHojaRegistro(hojaRegistro(reg));
      }
      setSimulado({
        r, impacto, narrativa, hoja, hilos: hilos?.hilos ?? 1, escenario: escenario === 'despues' ? 'despues' : 'antes',
        ...(comparacion ? { comparacion } : {}),
      });
    } catch (e) {
      alFallar(e);
    } finally {
      hilos?.cerrar();
      setOcupado(null);
    }
  };

  const crearHojaEscenarios = async () => {
    if (!datos) return;
    try {
      setNota(await escribirPlantillaEscenarios(plantillaEscenarios(datos.cron, datos.riesgos)) ? T.escenariosCreada : T.escenariosYaExiste);
    } catch (e) {
      alFallar(e);
    }
  };

  /** W7: la base (los riesgos activos, como «antes») y cada escenario, con las opciones de la simulación. */
  const compararQueSi = async () => {
    if (!datos) return;
    cancelado.current = false;
    const hilos = crearHilosPlazo(hilosEfectivos(leerPreferenciaHilos()));
    try {
      const hojas = await leerHojasCronograma();
      const lectura = leerEscenarios(hojas.escenarios, datos.cron, datos.riesgos);
      setProblemas(lectura.problemas);
      if (lectura.escenarios.length === 0) {
        if (lectura.problemas.length === 0) setNota(T.sinEscenarios);
        return;
      }
      setOcupado(T.comparandoEscenarios(0, 1));
      const op = {
        iteraciones, forma, semilla: OPCIONES_PLAZO_POR_DEFECTO.semilla, ceder,
        debeCancelar: () => cancelado.current,
        alAvanzar: (h: number, t: number) => setOcupado(T.comparandoEscenarios(h, t)),
      };
      const simular: typeof simularPlazo = (c, rs, o) =>
        hilos ? simularPlazoEnParalelo(c, rs, o, hilos.para(c, rs, o), hilos.hilos) : simularPlazo(c, rs, o);
      // La simulación que ya se hizo sirve de base si es la de «antes» con las mismas opciones.
      const reutilizable = simulado && simulado.escenario === 'antes' && !simulado.r.cancelada
        && simulado.r.iteraciones === iteraciones && simulado.r.forma === forma ? simulado.r : undefined;
      const cmp = await compararEscenarios(datos.cron, datos.riesgos, lectura.escenarios, op, simular, reutilizable);
      setProblemas([...lectura.problemas, ...cmp.problemas]);
      const narrativa = narrativaEscenarios(cmp, textoFecha);
      const hoja = await escribirHojaEscenarios(hojaEscenarios(cmp, textoFecha));
      setQueSi({ cmp, narrativa, hoja });
    } catch (e) {
      alFallar(e);
    } finally {
      hilos?.cerrar();
      setOcupado(null);
    }
  };

  const verCronograma = async () => {
    if (!resultado || !datos) return;
    try {
      const vista = vistaGantt(datos.cron.actividades, resultado.filas, resultado.fechaFinProyecto, simulado?.r, datos.cron.fechaCorte);
      const codigo = await codificarJson(vista);
      // Si no cabe en la dirección, la ventana la pide por mensaje al abrirse.
      const ventana = await abrirVentana(PAGINA_GANTT, codigo.length <= LIMITE_URL ? codigo : '', {
        alto: 85,
        ancho: 85,
        alRecibir: (texto) => {
          if (texto.includes('"listo"')) ventana.enviar(vista);
        },
      });
    } catch (e) {
      alFallar(e);
    }
  };

  /** V5: guarda la última simulación como instantánea (una por fecha de corte y escenario). */
  const guardarInstantanea = async () => {
    if (!simulado || !datos) return;
    try {
      const nueva = instantaneaDe(simulado.r, { fechaCorte: datos.cron.fechaCorte, escenario: simulado.escenario, ahora: serieLocal(new Date()) });
      const { lista, reemplazada } = agregarInstantanea(leerSeguimiento(await leerHojaSeguimiento()), nueva);
      await escribirHojaSeguimiento(hojaSeguimiento(lista));
      setSeguimiento(lista);
      setNota(reemplazada && nueva.fechaCorte !== undefined ? T.instantaneaReemplazada(textoFecha(nueva.fechaCorte)) : T.instantaneaGuardada(lista.length));
    } catch (e) {
      alFallar(e);
    }
  };

  /** V9: el cronograma (y la última simulación) como XML de MS Project o XER de P6. */
  const exportar = async (formato: 'msp' | 'p6') => {
    if (!resultado || !datos) return;
    try {
      const e = (formato === 'msp' ? exportarMspdi : exportarXer)({
        cronograma: datos.cron, filas: resultado.filas, proyecto: T.nombreExportado,
        ...(simulado && !simulado.r.cancelada ? { simulacion: simulado.r } : {}),
      });
      const archivo: ArchivoDescarga = formato === 'msp'
        ? { nombre: e.nombreArchivo, texto: e.texto, tipo: 'application/xml' }
        : { nombre: e.nombreArchivo, texto: e.texto, tipo: 'text/plain', windows1252: true };
      if (esEscritorio()) {
        const codigo = await codificarJson(archivo);
        if (codigo.length > 1_500_000) {
          setNota(T.exportarGrande);
          return;
        }
        abrirEnNavegador(`${new URL('/exportar.html', window.location.href).href}#d=${codigo}`);
      } else {
        descargarDirecto(archivo.windows1252 ? aWindows1252(archivo.texto) : new TextEncoder().encode(archivo.texto), archivo.nombre, archivo.tipo);
      }
      setNota([T.exportado(e.nombreArchivo), ...e.avisos].join(' '));
    } catch (e) {
      alFallar(e);
    }
  };

  /** V3: el informe PDF, con la plantilla del libro y lo último calculado y simulado. */
  const abrirInforme = async () => {
    if (!resultado || !datos) return;
    try {
      const d = datosInformeCronograma({
        cronograma: datos.cron,
        filas: resultado.filas,
        fechaFinProyecto: resultado.fechaFinProyecto,
        duracionProyecto: resultado.duracionProyecto,
        unidad: resultado.unidad,
        salud,
        ...(simulado ? { simulado } : {}),
        ...(simulado?.comparacion ? { comparacion: simulado.comparacion } : {}),
        ...(queSi ? { escenarios: queSi } : {}),
        ...(registro ? { registro } : {}),
        seguimiento,
        plantilla: await plantillaDelLibro(),
      });
      abrirEnNavegador(`${new URL('/informe.html', window.location.href).href}#d=${await codificarInforme(d)}`);
    } catch (e) {
      alFallar(e);
    }
  };

  const leerArchivo = async (f: File) => {
    setNota(null);
    try {
      const imp = importarCronograma(f.name, new Uint8Array(await f.arrayBuffer()));
      setImportado({ imp, ver: verificarContraFuente(imp), confirmar: false });
    } catch (e) {
      setImportado(null);
      alFallar(e);
    } finally {
      if (archivo.current) archivo.current.value = '';
    }
  };

  const escribirImportado = async (forzar: boolean) => {
    if (!importado) return;
    try {
      if (!forzar) {
        const hojas = await leerHojasCronograma();
        const hayDatos = (hojas.actividades?.length ?? 0) > 3;
        if (hayDatos) {
          setImportado({ ...importado, confirmar: true });
          return;
        }
      }
      await escribirCronogramaImportado(importado.imp);
      setImportado(null);
      await calcular();
      setNota(T.importadoEscrito);
    } catch (e) {
      alFallar(e);
    }
  };

  const rellenar = async () => {
    try {
      const hojas = await leerHojasCronograma();
      // V6: con la hoja «Rangos por tipo», cada actividad toma los % de su tipo; las demás, los del panel.
      const biblioteca = leerRangosTipo(hojas.rangosTipo);
      if (biblioteca.problemas.length > 0) {
        setNota(biblioteca.problemas.join(' '));
        return;
      }
      const r = completarRangos(hojas.actividades ?? [], pctMenos / 100, pctMas / 100, biblioteca.tipos);
      if ('error' in r) {
        setNota(r.error);
        return;
      }
      await escribirCeldasActividades(r.cambios);
      await calcular();
      const porTipo = Object.values(r.porTipo).reduce((a, b) => a + b, 0);
      setNota(`${T.rellenados(r.actividades)}${hojas.rangosTipo ? ` ${T.rellenadosPorTipo(porTipo, r.actividades - porTipo)}` : ''}`);
    } catch (e) {
      alFallar(e);
    }
  };

  const crearBiblioteca = async () => {
    try {
      setNota(await escribirPlantillaRangosTipo() ? T.bibliotecaCreada : T.bibliotecaYaExiste);
    } catch (e) {
      alFallar(e);
    }
  };

  const crearEjemplo = async (forzar: boolean) => {
    try {
      if (!forzar) {
        const hojas = await leerHojasCronograma();
        if ((hojas.actividades?.length ?? 0) > 3) {
          setConfirmarEjemplo(true);
          return;
        }
      }
      setConfirmarEjemplo(false);
      await escribirEjemploSector(hojasDeEjemplo(sector, serieLocal(new Date())));
      await calcular();
      setNota(T.ejemploCreado((EJEMPLOS_SECTOR.find((e) => e.id === sector) ?? EJEMPLOS_SECTOR[0]!).nombre));
    } catch (e) {
      alFallar(e);
    }
  };

  const plantilla = async () => {
    try {
      setNota(T.plantillaCreada(await escribirPlantillaCronograma()));
    } catch (e) {
      alFallar(e);
    }
  };

  const errores = problemas.filter((p) => p.gravedad === 'error');
  const avisos = problemas.filter((p) => p.gravedad === 'aviso');
  const criticas = resultado?.filas.filter((f) => f.critica) ?? [];
  const simulando = ocupado !== null && ocupado !== T.calculando;

  return (
    <section>
      <h2>{T.titulo}</h2>
      <p className="tenue">{T.intro}</p>
      <p>
        <button type="button" onClick={calcular} disabled={ocupado !== null}>{ocupado === T.calculando ? T.calculando : T.calcular}</button>{' '}
        <button type="button" onClick={plantilla} title={T.plantillaAyuda} disabled={ocupado !== null}>{T.plantilla}</button>{' '}
        <button type="button" onClick={() => archivo.current?.click()} title={T.importarAyuda} disabled={ocupado !== null}>{T.importar}</button>
        <input ref={archivo} type="file" accept=".xml,.xer,.mpp" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); }} />
      </p>
      <p title={T.ejemploAyuda}>
        <label>{T.ejemploSector}{' '}
          <select value={sector} onChange={(e) => { setSector(e.target.value as IdSector); setConfirmarEjemplo(false); }} disabled={ocupado !== null}>
            {EJEMPLOS_SECTOR.map((e) => <option key={e.id} value={e.id} title={e.descripcion}>{e.nombre}</option>)}
          </select>
        </label>{' '}
        <button type="button" onClick={() => void crearEjemplo(false)} disabled={ocupado !== null}>{T.ejemplo}</button>
      </p>
      {confirmarEjemplo && (
        <p className="aviso">
          {T.ejemploReemplazar}{' '}
          <button type="button" onClick={() => void crearEjemplo(true)}>{T.reemplazar}</button>{' '}
          <button type="button" className="secundario" onClick={() => setConfirmarEjemplo(false)}>{T.cancelarImportar}</button>
        </p>
      )}
      <PrimerUso hechos={[resultado !== null || problemas.length > 0, resultado !== null, salud !== null && !salud.comprobaciones.some((c) => c.estado === 'rojo'), (datos?.riesgos.length ?? 0) > 0, simulado !== null]} />
      {importado && <Importado i={importado} alEscribir={escribirImportado} alCancelar={() => setImportado(null)} />}
      {nota && <p className="aviso-ok">{nota}</p>}

      {errores.length > 0 && (
        <div className="error">
          <h3>{T.errores}</h3>
          <ul className="motivos">{errores.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </div>
      )}
      {avisos.length > 0 && (
        <>
          <h3>{T.avisos}</h3>
          <ul className="aviso-linea">{avisos.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </>
      )}

      {resultado && (
        <>
          <div className="cifras fechas">
            <div><span className="cifra">{textoFecha(resultado.fechaFinProyecto)}</span><span className="cifra-nombre">{T.finProyecto}</span></div>
            <div><span className="cifra">{resultado.duracionProyecto}</span><span className="cifra-nombre">{resultado.unidad === 'naturales' ? T.diasNaturales : T.dias}</span></div>
            <div><span className="cifra">{criticas.length} / {resultado.filas.length}</span><span className="cifra-nombre">{T.criticas}</span></div>
          </div>
          <p className="tenue">{T.rutaCritica}: {criticas.map((f) => f.nombre).join(' → ')}</p>
          <p className="tenue">{T.escritoEn(resultado.hoja)}</p>
          <p>
            <button type="button" onClick={verCronograma} disabled={ocupado !== null || !datos}>{T.verCronograma}</button>{' '}
            <button type="button" onClick={abrirInforme} disabled={ocupado !== null || !datos} title={T.informeAyuda}>{T.informe}</button>{' '}
            <button type="button" onClick={() => void exportar('msp')} disabled={ocupado !== null || !datos} title={T.exportarAyuda}>{T.exportarMsp}</button>{' '}
            <button type="button" onClick={() => void exportar('p6')} disabled={ocupado !== null || !datos} title={T.exportarAyuda}>{T.exportarP6}</button>{' '}
            <span className="tenue">{T.verCronogramaAyuda}</span>
          </p>
        </>
      )}

      {salud && <Salud informe={salud} />}
      {registro && <RegistroRiesgos r={registro} />}
      {salud && salud.comprobaciones.some((c) => (c.codigo === 'incertidumbre' || c.codigo === 'optimismo') && c.estado !== 'verde') && (
        <p title={T.rellenarAyuda}>
          <button type="button" onClick={rellenar} disabled={ocupado !== null}>{T.rellenarRangos}</button>{' '}
          <label>{T.menos}<input type="number" min={0} max={90} value={pctMenos} onChange={(e) => setPctMenos(Number(e.target.value))} style={{ width: 48 }} /> %</label>{' '}
          <label>{T.mas}<input type="number" min={0} max={500} value={pctMas} onChange={(e) => setPctMas(Number(e.target.value))} style={{ width: 48 }} /> %</label>{' '}
          <button type="button" onClick={crearBiblioteca} disabled={ocupado !== null} title={T.bibliotecaAyuda}>{T.biblioteca}</button>
        </p>
      )}

      {salud && (
        <>
          <h3>{T.simulacion}</h3>
          <ControlesVistaPrevia prefs={previa.prefs} cambiar={previa.cambiar} sinEventos={previa.sinEventos} deshabilitado={false} />
          {previa.vista && <TarjetaVistaPrevia v={previa.vista} {...(simulado ? { completa: simulado.r } : {})} />}
          {datos && datos.riesgos.length === 0 && <p className="tenue">{T.sinRiesgos}</p>}
          <p>
            <label>{T.iteraciones}{' '}
              <select value={iteraciones} onChange={(e) => setIteraciones(Number(e.target.value))} disabled={ocupado !== null}>
                {ITERACIONES.map((n) => <option key={n} value={n}>{n.toLocaleString('es')}</option>)}
              </select>
            </label>{' '}
            {datos && datos.riesgos.some(tieneMitigacion) && (
              <>
                <label>{T.escenario}{' '}
                  <select value={escenario} onChange={(e) => setEscenario(e.target.value as 'antes' | 'despues' | 'comparar')} disabled={ocupado !== null}>
                    <option value="antes">{T.escenarios.antes}</option>
                    <option value="despues">{T.escenarios.despues}</option>
                    <option value="comparar">{T.escenarios.comparar}</option>
                  </select>
                </label>{' '}
              </>
            )}
            <label>{T.forma}{' '}
              <select value={forma} onChange={(e) => setForma(e.target.value as FormaDuracion)} disabled={ocupado !== null}>
                <option value="pert">{T.formas.pert}</option>
                <option value="triangular">{T.formas.triangular}</option>
              </select>
            </label>
          </p>
          <p>
            <button type="button" onClick={simular} disabled={ocupado !== null || !datos || salud.bloquea}>{T.simular}</button>{' '}
            {simulando && <><span className="tenue">{ocupado}</span>{' '}<button type="button" onClick={() => (cancelado.current = true)}>{T.cancelar}</button></>}
          </p>
          {salud.bloquea && <p className="aviso-linea">{T.saludBloquea}</p>}
          {simulado && <ResultadoPlazo s={simulado} />}
          {simulado && !simulado.r.cancelada && (
            <p title={T.seguimientoAyuda}>
              <button type="button" onClick={guardarInstantanea} disabled={ocupado !== null}>{T.guardarInstantanea}</button>{' '}
              {datos?.cron.fechaCorte === undefined && <span className="tenue">{T.sinCorteAviso}</span>}
            </p>
          )}
          {seguimiento.length > 0 && <Seguimiento lista={seguimiento} />}
          <Plegable id="cronograma-quesi" titulo={T.queSi} resumen={queSi ? `${queSi.cmp.escenarios.length}` : ''}>
            <p className="tenue">{T.queSiIntro}</p>
            <p>
              <button type="button" onClick={crearHojaEscenarios} disabled={ocupado !== null || !datos}>{T.crearEscenarios}</button>{' '}
              <button type="button" onClick={compararQueSi} disabled={ocupado !== null || !datos || salud.bloquea}>{T.compararEscenarios}</button>
            </p>
            {queSi && <TablaEscenarios q={queSi} />}
          </Plegable>
        </>
      )}
    </section>
  );
}

/** W7: la comparación de escenarios con la base. */
function TablaEscenarios({ q }: { q: { cmp: ComparacionEscenarios; narrativa: string[]; hoja: string } }) {
  const d = (x: number) => (Math.round(x * 10) / 10).toLocaleString('es-ES');
  const conCosto = q.cmp.base.costos !== undefined;
  return (
    <>
      {q.narrativa.map((t, i) => <p key={i}>{t}</p>)}
      <table>
        <thead>
          <tr>
            <th>{T.escenarioCol}</th><th>P80</th><th>{T.adelantoP80}</th><th>{T.adelantoMedio}</th><th>{T.terminaAntes}</th>
            {conCosto && <th>{T.costoCol}</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{T.escenarioBase}</th><td>{textoFecha(q.cmp.base.fechas.p80)}</td><td /><td /><td />
            {conCosto && <td>{textoMoneda(q.cmp.base.costos!.p80)}</td>}
          </tr>
          {q.cmp.escenarios.map((e) => (
            <tr key={e.nombre} title={e.cambios.join('\n')}>
              <th scope="row">{e.nombre}</th>
              <td>{textoFecha(e.r.fechas.p80)}</td>
              <td>{T.diasNat(d(e.adelantoP80))}</td>
              <td title={T.margenPareado(d(e.ic95), d(e.ic95Independientes))}>{T.diasNat(d(e.adelantoMedio))} ± {d(e.ic95)}</td>
              <td>{Math.round(e.probAntes * 100)} %</td>
              {conCosto && <td>{e.r.costos ? textoMoneda(e.r.costos.p80) : ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tenue">{T.escenariosNota} {T.resultadoEscenariosEn(q.hoja)}</p>
    </>
  );
}

const COLOR: Record<Semaforo, string> = { verde: '#2e9e5b', amarillo: '#d9a400', rojo: '#e34948', info: '#8a8f98' };

function Punto({ estado }: { estado: Semaforo }) {
  return <span aria-label={estado} title={estado} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: COLOR[estado], marginRight: 6, flex: 'none' }} />;
}

function Salud({ informe }: { informe: InformeSalud }) {
  return (
    <Plegable
      id="cronograma-salud"
      abierta={informe.estado !== 'verde'}
      titulo={<><Punto estado={informe.estado} />{T.salud}</>}
      resumen={T.saludResumen[informe.estado]}
    >
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {informe.comprobaciones.map((c) => (
          <li key={c.codigo} style={{ margin: '6px 0' }}>
            <details>
              <summary style={{ display: 'flex', alignItems: 'baseline', cursor: 'pointer' }}>
                <Punto estado={c.estado} /><span><strong>{c.titulo}.</strong> <span className="tenue">{c.detalle}</span></span>
              </summary>
              <p className="tenue" style={{ margin: '4px 0 0 16px' }}>{c.porque}</p>
              {c.actividades.length > 0 && c.estado !== 'verde' && (
                <p className="tenue" style={{ margin: '2px 0 0 16px' }}>{T.actividadesImplicadas}: {c.actividades.join(', ')}</p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </Plegable>
  );
}

function ResultadoPlazo({ s }: { s: Simulado }) {
  const { r, impacto } = s;
  const top = [...r.actividades].filter((a) => a.criticidad > 0).sort((a, b) => b.criticidad - a.criticidad || (b.correlacion || 0) - (a.correlacion || 0)).slice(0, 6);
  return (
    <>
      {r.cancelada && <p className="aviso-linea">{T.cancelada}</p>}
      <div className="cifras fechas">
        <div><span className="cifra">{textoFecha(r.fechas.p50)}</span><span className="cifra-nombre">P50</span></div>
        <div><span className="cifra">{textoFecha(r.fechas.p80)}</span><span className="cifra-nombre">P80</span></div>
        <div><span className="cifra">{textoFecha(r.fechas.p90)}</span><span className="cifra-nombre">P90</span></div>
        <div><span className="cifra">{Math.round(r.probDeterminista * 100)} %</span><span className="cifra-nombre">{T.probCumplir}</span></div>
      </div>
      {r.costos && (
        <div className="cifras fechas">
          <div><span className="cifra">{textoMoneda(r.costos.p50)}</span><span className="cifra-nombre">{T.costoP50}</span></div>
          <div><span className="cifra">{textoMoneda(r.costos.p80)}</span><span className="cifra-nombre">{T.costoP80}</span></div>
          <div><span className="cifra">{Math.round(r.costos.jclP80 * 100)} %</span><span className="cifra-nombre">{T.jcl}</span></div>
        </div>
      )}
      {s.narrativa.map((l) => <p key={l}>{l}</p>)}
      {r.hitos && r.hitos.length > 0 && <Hitos r={r} />}
      {!r.cancelada && <ReservaContingencia r={r} impacto={impacto} />}
      {r.convergencias.length > 0 && <Convergencias r={r} />}
      {s.comparacion && <Comparacion c={s.comparacion} />}
      <Histograma r={r} />
      {r.costos && <Nube r={r} />}
      {impacto && impacto.porRiesgo.length > 0 && (
        <Plegable id="cronograma-riesgos" abierta titulo={T.riesgos}>
          <table>
            <thead><tr><th>{T.riesgoCol}</th><th>{T.probCol}</th><th>{T.diasP80}</th>{r.costos && <th>{T.costoP80Col}</th>}</tr></thead>
            <tbody>
              {impacto.porRiesgo.map((x) => (
                <tr key={x.id}>
                  <td>{x.nombre}</td><td>{Math.round(x.probabilidad * 100)} %</td><td>{x.diasP80 > 0 ? `+${x.diasP80}` : x.diasP80}</td>
                  {r.costos && <td>{textoMoneda(x.costoP80 ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Plegable>
      )}
      <Plegable id="cronograma-criticas" titulo={T.masCriticas}>
        <table>
          <thead><tr><th>ID</th><th>{T.actividadCol}</th><th>{T.criticidadCol}</th></tr></thead>
          <tbody>
            {top.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.nombre}</td><td>{Math.round(a.criticidad * 100)} %</td></tr>)}
          </tbody>
        </table>
      </Plegable>
      <p className="tenue">{T.escritoEn(s.hoja)} {T.calculadoCon(r.iteraciones, s.hilos)}</p>
    </>
  );
}

function Histograma({ r }: { r: ResultadoSimulacionPlazo }) {
  return (
    <HistogramaFechas histograma={r.histograma} diaCronograma={Math.max(0, Math.ceil(r.determinista.dias - 1e-9) - 1)}
      diaP80={r.dias.p80 - 1} titulo={T.histograma} marcaCronograma={T.marcaCronograma} />
  );
}

function Importado({ i, alEscribir, alCancelar }: {
  i: { imp: CronogramaImportado; ver: Verificacion; confirmar: boolean };
  alEscribir: (forzar: boolean) => void;
  alCancelar: () => void;
}) {
  const { imp, ver } = i;
  const relaciones = imp.cronograma.actividades.reduce((n, a) => n + a.predecesoras.length, 0);
  const bien = ver.total > 0 && ver.coinciden === ver.total;
  return (
    <div className="importado" style={{ border: '1px solid var(--borde)', borderRadius: 4, padding: '8px 10px', margin: '8px 0' }}>
      <p><strong>{T.importado(imp.fuente, imp.proyecto, imp.cronograma.actividades.length, relaciones)}</strong></p>
      {imp.avisos.length > 0 && <ul className="aviso-linea">{imp.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      <p className={bien ? 'aviso-ok' : 'aviso-linea'}>{T.verificacion}: {ver.resumen}</p>
      {ver.diferencias.length > 0 && (
        <ul className="tenue">
          {ver.diferencias.slice(0, 10).map((d) => (
            <li key={`${d.id}-${d.campo}`}>{T.diferencia(d.id, d.nombre, d.campo, textoFecha(d.fuente), textoFecha(d.calculado))}</li>
          ))}
        </ul>
      )}
      {i.confirmar ? (
        <p className="aviso-linea">
          {T.reemplazarAviso}{' '}
          <button type="button" onClick={() => alEscribir(true)}>{T.reemplazar}</button>{' '}
          <button type="button" onClick={alCancelar}>{T.cancelarImportar}</button>
        </p>
      ) : (
        <p>
          <button type="button" onClick={() => alEscribir(false)}>{T.escribirImportado}</button>{' '}
          <button type="button" onClick={alCancelar}>{T.cancelarImportar}</button>
        </p>
      )}
    </div>
  );
}

/** La nube costo–plazo (P5). */
function Nube({ r }: { r: ResultadoSimulacionPlazo }) {
  const c = r.costos;
  if (!c) return null;
  const paso = Math.max(1, Math.floor(r.finProyecto.length / 1500));
  const puntos: Array<[number, number]> = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < r.finProyecto.length; i += paso) {
    const f = r.finProyecto[i] as number;
    puntos.push([f, c.porIteracion[i] as number]);
    min = Math.min(min, f);
    max = Math.max(max, f);
  }
  return <NubeCostoPlazo puntos={puntos} p80Dias={r.dias.p80} p80Costo={c.p80} fechaMin={r.cal(min)} fechaMax={r.cal(max)} titulo={T.nube} />;
}

/** W4: el sesgo de convergencia: la que más pesa, en gráfico; las siguientes, en tabla. */
function Convergencias({ r }: { r: ResultadoSimulacionPlazo }) {
  const [c, ...resto] = r.convergencias;
  if (!c) return null;
  return (
    <Plegable id="cronograma-convergencias" titulo={T.convergencias} resumen={T.convergenciasResumen(r.convergencias.length)}>
      <BarrasConvergencia c={c} textos={{ titulo: T.convergenciaGrafico(c.nombre, textoFecha(c.inicioPlan)), todas: T.convergenciaTodas, independientes: T.convergenciaIndependientes }} />
      {resto.length > 0 && (
        <table>
          <thead><tr><th>{T.convergenciaCol}</th><th>{T.aTiempoCol}</th><th>{T.ramasCol}</th></tr></thead>
          <tbody>
            {resto.slice(0, 4).map((x) => (
              <tr key={x.id}><td>{x.nombre}</td><td>{Math.round(x.probATiempo * 100)} %</td><td>{x.ramas.map((y) => `${Math.round(y.probATiempo * 100)} %`).join(' · ')}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tenue">{T.convergenciasNota}</p>
    </Plegable>
  );
}

/** W2: la reserva de contingencia al nivel elegido y de dónde sale. */
function ReservaContingencia({ r, impacto }: { r: ResultadoSimulacionPlazo; impacto?: Simulado['impacto'] }) {
  const [nivel, setNivel] = useState<NivelReserva>('p80');
  const res = reservaContingencia(r, impacto, nivel);
  const dias = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(Math.round(n * 10) / 10).toLocaleString('es')}`;
  const unidad = r.unidad === 'naturales' ? T.diasNaturalesCorto : T.diasLaborablesCorto;
  return (
    <Plegable id="cronograma-reserva" abierta titulo={T.reserva} resumen={T.reservaResumen(nivel.toUpperCase(), dias(res.dias), unidad, res.costo !== undefined ? textoMoneda(res.costo) : undefined)}>
      <p role="group" aria-label={T.reservaNivel} style={{ margin: '4px 0' }}>
        {(['p50', 'p80', 'p90'] as const).map((n) => (
          <button key={n} type="button" className={nivel === n ? '' : 'secundario'} aria-pressed={nivel === n} onClick={() => setNivel(n)} style={{ marginRight: 4 }}>{n.toUpperCase()}</button>
        ))}
      </p>
      <p>{T.reservaTexto(nivel.toUpperCase(), textoFecha(res.plan.fecha), textoFecha(res.objetivo.fecha), dias(res.dias), unidad, res.costo !== undefined ? textoMoneda(res.costo) : undefined)}</p>
      <table>
        <thead><tr><th>{T.reservaParte}</th><th>{unidad}</th>{res.costo !== undefined && <th>{T.costoCol}</th>}</tr></thead>
        <tbody>
          {res.partes.map((x) => (
            <tr key={x.id} style={x.tipo === 'oportunidad' ? { color: 'var(--sube, #2a78d6)' } : undefined}>
              <td>{x.nombre}</td><td>{dias(x.dias)}</td>{res.costo !== undefined && <td>{textoMoneda(x.costo ?? 0)}</td>}
            </tr>
          ))}
          <tr><th scope="row">{T.reservaTotal}</th><th>{dias(res.dias)}</th>{res.costo !== undefined && <th>{textoMoneda(res.costo)}</th>}</tr>
        </tbody>
      </table>
      <p className="tenue">{impacto ? T.reservaNota : T.reservaSinRiesgos}</p>
    </Plegable>
  );
}

/** W1: los hitos contractuales: si se cumplen, cuándo y cuánto cuestan en multas. */
function Hitos({ r }: { r: ResultadoSimulacionPlazo }) {
  const hitos = r.hitos ?? [];
  const peor = Math.min(...hitos.map((h) => h.probCumplir));
  return (
    <Plegable id="cronograma-hitos" abierta titulo={T.hitos} resumen={T.hitosResumen(hitos.length, peor)}>
      <table>
        <thead><tr><th>{T.hitoCol}</th><th>{T.fechaContractualCol}</th><th>{T.probCumplirCol}</th><th>P80</th><th>{T.margenCol}</th>{r.multas && <th>{T.multaMediaCol}</th>}</tr></thead>
        <tbody>
          {hitos.map((h) => (
            <tr key={h.id}>
              <td>{h.nombre}</td><td>{textoFecha(h.fecha)}</td>
              <td style={{ color: h.probCumplir < 0.5 ? 'var(--baja, #e34948)' : undefined }}>{Math.round(h.probCumplir * 100)} %</td>
              <td>{textoFecha(h.p80)}</td><td>{h.margenP80 >= 0 ? `+${T.diasN(h.margenP80)}` : `−${T.diasN(-h.margenP80)}`}</td>
              {r.multas && <td>{h.multaDia ? textoMoneda(h.multaMedia) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {r.multas && <p className="tenue">{T.multasResumen(r.multas.probAlguna, textoMoneda(r.multas.media), textoMoneda(r.multas.p80))}</p>}
    </Plegable>
  );
}

/** V10: las matrices de probabilidad e impacto (consolidada, amenazas, oportunidades) y lo que pide atención. */
function RegistroRiesgos({ r }: { r: Registro }) {
  const [vista, setVista] = useState<'consolidada' | 'amenazas' | 'oportunidades'>('consolidada');
  const abiertos = r.filas.filter((f) => f.estado !== 'cerrado');
  const rojos = abiertos.filter((f) => f.clase === 'amenaza' && f.zona === 'roja').length;
  const oportunidades = abiertos.filter((f) => f.clase === 'oportunidad').length;
  return (
    <Plegable id="cronograma-registro" abierta={rojos > 0 || r.vencidas > 0} titulo={T.registro} resumen={T.registroResumen(abiertos.length - oportunidades, oportunidades, rojos, r.vencidas)}>
      <p role="group" aria-label={T.matrizVista} style={{ margin: '4px 0' }}>
        {(['consolidada', 'amenazas', 'oportunidades'] as const).map((v) => (
          <button key={v} type="button" className={vista === v ? '' : 'secundario'} aria-pressed={vista === v} onClick={() => setVista(v)} style={{ marginRight: 4 }}>
            {T.matrices[v]}
          </button>
        ))}
      </p>
      {vista === 'consolidada' && <MatrizConsolidada amenazas={r.matriz} oportunidades={r.matrizOportunidades} textos={T.matrices} />}
      {vista === 'amenazas' && <MatrizRiesgos matriz={r.matriz} />}
      {vista === 'oportunidades' && <MatrizRiesgos matriz={r.matrizOportunidades} clase="oportunidad" />}
      {r.vencidas > 0 && <p className="aviso-linea">{T.vencidas(r.filas.filter((f) => f.vencida).map((f) => f.id).join(', '))}</p>}
      <table>
        <thead><tr><th>ID</th><th>{T.riesgoCol}</th><th>{T.estadoCol}</th><th>{T.puntajeCol}</th><th>{T.responsableCol}</th></tr></thead>
        <tbody>
          {r.filas.filter((f) => vista === 'consolidada' || (vista === 'oportunidades') === (f.clase === 'oportunidad')).slice(0, 12).map((f) => (
            <tr key={f.id} style={f.estado === 'cerrado' ? { opacity: 0.55 } : undefined}>
              <td>{f.id}</td><td>{f.nombre}{f.clase === 'oportunidad' && <span className="tenue"> · {T.oportunidad}</span>}</td><td>{T.estados[f.estado]}</td>
              <td><span style={{ background: colorDe(f.clase, f.puntaje), color: '#1b1b1b', padding: '0 6px', borderRadius: 3 }}>{f.puntaje}</span></td>
              <td>{f.responsable ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tenue">{T.escritoEn('Registro de riesgos')}</p>
    </Plegable>
  );
}

/** V5: la tendencia de las instantáneas guardadas. */
function Seguimiento({ lista }: { lista: Instantanea[] }) {
  return (
    <Plegable id="cronograma-seguimiento" abierta titulo={T.seguimiento} resumen={lista.length === 1 ? T.unaInstantanea : T.instantaneas(lista.length)}>
      {lista.length === 1 && <p className="tenue">{T.unaInstantanea}</p>}
      {tendencia(lista).map((l) => <p key={l}>{l}</p>)}
      <TendenciaPlazo puntos={lista} titulo={T.tendencia} nombres={{ cronograma: T.serieCronograma, p50: 'P50', p80: 'P80' }} />
    </Plegable>
  );
}

/** V1: antes y después de mitigar, y lo que rinde cada respuesta. */
function Comparacion({ c }: { c: { cmp: ComparacionMitigacion; narrativa: string[] } }) {
  const { antes: a, despues: d } = c.cmp;
  return (
    <Plegable id="cronograma-mitigacion" abierta titulo={T.mitigacion}>
      {c.narrativa.map((l) => <p key={l}>{l}</p>)}
      <table>
        <thead><tr><th /><th>{T.escenarios.antes}</th><th>{T.escenarios.despues}</th></tr></thead>
        <tbody>
          <tr><td>P80</td><td>{textoFecha(a.fechas.p80)}</td><td>{textoFecha(d.fechas.p80)}</td></tr>
          {a.costos && d.costos && <tr><td>{T.costoP80}</td><td>{textoMoneda(a.costos.p80)}</td><td>{textoMoneda(d.costos.p80)}</td></tr>}
        </tbody>
      </table>
      <table>
        <thead><tr><th>{T.respuestaCol}</th><th>{T.costoCol}</th><th>{T.diasP80}</th><th>{T.retornoCol}</th></tr></thead>
        <tbody>
          {c.cmp.porRespuesta.map((x) => (
            <tr key={x.id}>
              <td>{x.respuesta || x.nombre}</td>
              <td>{textoMoneda(x.costoRespuesta)}</td>
              <td>{x.diasP80 > 0 ? `−${x.diasP80}` : '0'}</td>
              <td>{x.retorno === undefined ? '—' : `${x.retorno.toFixed(2).replace('.', ',')} ×`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tenue">{T.escritoEn('Cronograma (mitigación)')}</p>
    </Plegable>
  );
}
