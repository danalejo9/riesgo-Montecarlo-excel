/**
 * Configuración: todo lo que se puede ajustar, en un solo sitio.
 *
 * Tres bloques que se guardan en sitios distintos, y se dice en cada uno:
 *
 * - **Rendimiento** es de este equipo (núcleos): va en el navegador, no en el
 *   libro, porque depende de la máquina y no cambia ningún resultado.
 * - **Simulación** y **Precisión** son del modelo: van en el libro, con las
 *   entradas y las salidas, porque cambiarlas cambia los números y quien
 *   reciba el libro tiene que poder repetir exactamente la misma simulación.
 */

import { useEffect, useState } from 'react';

import {
  describirEstadistico,
  type EstadisticoFijo,
  type ModoLibro,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MAXIMO_TITULO,
  OBJETIVO_PRECISION_POR_DEFECTO,
  leerPercentilesTexto,
  percentilesDelModelo,
  type PercentilesRiskModel,
  type ConvergenciaRiskModel,
  type ModeloRiesgo,
} from '../engine/modelo/index.ts';
import { leerNumero, miles } from './formato.ts';
import { aplicarModo } from '../excel/modoLibro.ts';
import { modoLibroEnMemoria } from '../excel/modoLibroCompartido.ts';
import {
  guardarCongelarPantalla,
  guardarPreferenciaHilos,
  hilosAutomaticos,
  hilosEfectivos,
  leerCongelarPantalla,
  leerPreferenciaHilos,
  nucleosDelEquipo,
  type PreferenciaHilos,
} from './motor/preferencias.ts';

const PRESETS = [1_000, 10_000, 100_000, 1_000_000];
const OBJETIVOS = [0.005, 0.01, 0.02, 0.05];
const MAXIMO_ITERACIONES = 10_000_000;

export function Configuracion({
  modelo,
  alCambiar,
  hilosUltimaSimulacion,
}: {
  modelo: ModeloRiesgo;
  alCambiar: (m: ModeloRiesgo) => void;
  hilosUltimaSimulacion?: number;
}) {
  const s = modelo.settings;
  const conv: ConvergenciaRiskModel = s.convergence ?? {
    target: OBJETIVO_PRECISION_POR_DEFECTO,
    untilConverged: false,
    maxIterations: Math.max(s.iterations, 1_000_000),
  };
  const cambiarAjustes = (cambios: Partial<ModeloRiesgo['settings']>) =>
    alCambiar({ ...modelo, settings: { ...s, ...cambios } });
  const cambiarConv = (cambios: Partial<ConvergenciaRiskModel>) => cambiarAjustes({ convergence: { ...conv, ...cambios } });

  return (
    <>
      <Proyecto modelo={modelo} alCambiar={alCambiar} />

      <ModoDelLibro />

      <Rendimiento hilosUltimaSimulacion={hilosUltimaSimulacion} />

      <section>
        <h2>Simulación</h2>
        <p className="tenue">Se guarda en el libro, con el modelo: cambia los resultados.</p>
        <div className="parametros">
          <CampoIteraciones
            etiqueta={conv.untilConverged ? 'Iteraciones de la primera tanda' : 'Iteraciones'}
            valor={s.iterations}
            alCambiar={(iterations) => cambiarAjustes({ iterations })}
          />

          <CampoEntero
            etiqueta="Semilla"
            ayuda="La misma semilla da el mismo resultado."
            valor={s.seed}
            permitirNegativo
            alCambiar={(seed) => cambiarAjustes({ seed })}
          />

          <label className="campo">
            <span className="tenue">Muestreo</span>
            <select
              value={s.sampling}
              onChange={(e) => cambiarAjustes({ sampling: e.target.value as ModeloRiesgo['settings']['sampling'] })}
            >
              <option value="monte-carlo">Monte Carlo</option>
              <option value="lhs">Hipercubo latino</option>
            </select>
            <span className="tenue ayuda">
              El hipercubo latino reparte las muestras por toda la distribución y converge antes.
            </span>
          </label>

          <label className="campo">
            <span className="tenue">Motor</span>
            <select
              value={s.engine}
              onChange={(e) => cambiarAjustes({ engine: e.target.value as ModeloRiesgo['settings']['engine'] })}
            >
              <option value="auto">Automático</option>
              <option value="fast">Rápido</option>
              <option value="compatible">Compatible (Excel en el bucle)</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>Precisión</h2>
        <p className="tenue">
          El margen con el que se decide si las iteraciones bastan: la media y el
          P80 se tienen que conocer con ± ese porcentaje (al 95 %). También se guarda en el libro.
        </p>
        <div className="parametros">
          <label className="campo">
            <span className="tenue">Margen objetivo</span>
            <select value={conv.target} onChange={(e) => cambiarConv({ target: Number(e.target.value) })}>
              {OBJETIVOS.map((o) => (
                <option key={o} value={o}>± {(o * 100).toLocaleString('es-ES')} %</option>
              ))}
            </select>
          </label>

          <label className="campo casilla">
            <input
              type="checkbox"
              checked={conv.untilConverged}
              onChange={(e) => cambiarConv({ untilConverged: e.target.checked })}
            />
            <span>Simular hasta alcanzar la precisión</span>
          </label>

          {conv.untilConverged && (
            <>
              <CampoIteraciones
                etiqueta="Tope de iteraciones"
                valor={conv.maxIterations}
                alCambiar={(maxIterations) => cambiarConv({ maxIterations })}
              />
              <p className="tenue ayuda">
                Empieza con {miles(Math.min(s.iterations, conv.maxIterations))} iteraciones y, si alguna
                salida no alcanza el ±{(conv.target * 100).toLocaleString('es-ES')} %, repite con las que
                hagan falta (hasta 5 tandas), sin pasar de {miles(conv.maxIterations)}. El resultado final es
                el mismo que si hubieras pedido esas iteraciones de entrada. Solo con el motor rápido: con
                Excel en el bucle cada tanda costaría minutos.
              </p>
            </>
          )}
        </div>
      </section>

      <Percentiles modelo={modelo} alCambiar={(percentiles) => cambiarAjustes({ percentiles })} />
    </>
  );
}

const BAJOS = [0.01, 0.025, 0.05, 0.1, 0.2] as const;
const ALTOS = [0.8, 0.9, 0.95, 0.975, 0.99] as const;
const pctTexto = (p: number) => `p${(Math.round(p * 1000) / 10).toLocaleString('es-ES')}`;

/** C6: qué percentiles se enseñan (las cifras y las tablas) y cuáles se calculan además (la hoja volcada). */
function Percentiles({ modelo, alCambiar }: { modelo: ModeloRiesgo; alCambiar: (p: PercentilesRiskModel) => void }) {
  const p = percentilesDelModelo(modelo.settings);
  const [texto, setTexto] = useState(p.extra.map((x) => (Math.round(x * 1000) / 10).toLocaleString('es-ES')).join('; '));
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <section>
      <h2>Percentiles</h2>
      <p className="tenue">
        Los dos que se enseñan junto a la media en Resultados, en la tabla de salidas, al comparar escenarios y en
        el informe. Los adicionales se calculan además y salen en la hoja volcada (p1, p5, p10, p25, p50, p75, p90,
        p95 y p99 salen siempre). Se guardan en el libro y valen desde la próxima simulación.
      </p>
      <div className="parametros">
        <label className="campo">
          <span className="tenue">Bajo</span>
          <select value={p.low} onChange={(e) => alCambiar({ ...p, low: Number(e.target.value) })}>
            {BAJOS.map((x) => <option key={x} value={x}>{pctTexto(x)}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="tenue">Alto</span>
          <select value={p.high} onChange={(e) => alCambiar({ ...p, high: Number(e.target.value) })}>
            {ALTOS.map((x) => <option key={x} value={x}>{pctTexto(x)}</option>)}
          </select>
        </label>
        <label className="campo ancho">
          <span className="tenue">Adicionales (en %, separados por «;»)</span>
          <input
            type="text"
            value={texto}
            placeholder="por ejemplo 2,5; 80; 97,5"
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              const lista = leerPercentilesTexto(texto);
              if (lista === null) {
                setAviso('Escribe hasta 10 números entre 0 y 100, separados por «;» (por ejemplo 2,5; 80; 97,5).');
                return;
              }
              setAviso(null);
              alCambiar({ ...p, extra: lista });
            }}
          />
          {aviso && <span className="aviso-linea">{aviso}</span>}
        </label>
      </div>
    </section>
  );
}

/**
 * El modo del libro (B2): qué enseñan las celdas RIESGO fuera de la
 * simulación. Se guarda en el libro. También se cambia desde la cinta; el
 * evento `riesgo:modo` mantiene esto al día.
 */
function ModoDelLibro() {
  const [modo, setModo] = useState<ModoLibro>(() => modoLibroEnMemoria());
  const [error, setError] = useState<string | null>(null);
  const [p, setP] = useState(() => (modo.fijo.tipo === 'percentil' ? String(Math.round(modo.fijo.p * 100)) : '90'));

  useEffect(() => {
    const alCambiar = (e: Event) => setModo((e as CustomEvent<ModoLibro>).detail);
    window.addEventListener('riesgo:modo', alCambiar);
    return () => window.removeEventListener('riesgo:modo', alCambiar);
  }, []);

  const aplicar = (m: ModoLibro) => {
    setModo(m);
    setError(null);
    void aplicarModo(m).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const tipo = modo.fijo.tipo;
  const conPercentil = (texto: string): EstadisticoFijo | null => {
    const n = leerNumero(texto);
    return n !== null && n > 0 && n < 100 ? { tipo: 'percentil', p: n / 100 } : null;
  };

  return (
    <section>
      <h2>Modo del libro</h2>
      <p className="tenue">
        Qué enseñan las celdas con funciones RIESGO cuando no se simula. Se guarda en el libro y no cambia los
        resultados de la simulación. También se cambia desde la cinta (Valores fijos / Aleatorio).
      </p>
      <div className="parametros">
        <label className="campo">
          <span className="tenue">Modo</span>
          <select value={modo.modo} onChange={(e) => aplicar({ ...modo, modo: e.target.value === 'aleatorio' ? 'aleatorio' : 'fijo' })}>
            <option value="fijo">Valores fijos</option>
            <option value="aleatorio">Aleatorio (F9 vuelve a sortear)</option>
          </select>
        </label>
        <label className="campo">
          <span className="tenue">Valor fijo</span>
          <select
            value={tipo}
            disabled={modo.modo === 'aleatorio'}
            onChange={(e) => {
              const t = e.target.value;
              const fijo: EstadisticoFijo = t === 'percentil' ? conPercentil(p) ?? { tipo: 'percentil', p: 0.9 } : { tipo: t === 'mediana' || t === 'moda' ? t : 'media' };
              aplicar({ ...modo, fijo });
            }}
          >
            <option value="media">Media</option>
            <option value="mediana">Mediana</option>
            <option value="moda">Moda (el más probable)</option>
            <option value="percentil">Percentil…</option>
          </select>
        </label>
        {tipo === 'percentil' && modo.modo === 'fijo' && (
          <label className="campo">
            <span className="tenue">Percentil (1 a 99)</span>
            <input
              type="text"
              inputMode="decimal"
              value={p}
              onChange={(e) => setP(e.target.value)}
              onBlur={() => {
                const f = conPercentil(p);
                if (f) aplicar({ ...modo, fijo: f });
                else setP(String(Math.round((modo.fijo as { p: number }).p * 100)));
              }}
            />
          </label>
        )}
      </div>
      <p className="tenue ayuda">
        {modo.modo === 'aleatorio'
          ? 'Cada celda RIESGO enseña un valor al azar; pulsa F9 para sortear otra vez y ver cómo se mueve el modelo.'
          : `Cada celda RIESGO enseña ${describirEstadistico(modo.fijo)} de su distribución.`}
      </p>
      {error && <p className="aviso-linea">No se pudo aplicar: {error}</p>}
    </section>
  );
}

function Rendimiento({ hilosUltimaSimulacion }: { hilosUltimaSimulacion?: number }) {
  const [pref, setPref] = useState<PreferenciaHilos>(() => leerPreferenciaHilos());
  const [congelar, setCongelar] = useState(() => leerCongelarPantalla());
  const nucleos = nucleosDelEquipo();
  const cambiar = (p: PreferenciaHilos) => {
    setPref(p);
    guardarPreferenciaHilos(p);
  };

  return (
    <section>
      <h2>Rendimiento</h2>
      <p className="tenue">De este equipo, no del libro. No cambia los resultados, solo la velocidad.</p>
      <div className="parametros">
        <label className="campo">
          <span className="tenue">Núcleos para calcular</span>
          <select
            value={String(pref)}
            onChange={(e) => cambiar(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
          >
            <option value="auto">Automático ({hilosAutomaticos()} de {nucleos})</option>
            {Array.from({ length: nucleos }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n === 1 ? '1 núcleo' : `${n} núcleos`}</option>
            ))}
          </select>
          <span className="tenue ayuda">
            Este equipo tiene {nucleos} núcleos. Se usarán {hilosEfectivos(pref)}
            {hilosUltimaSimulacion ? `; la última simulación usó ${hilosUltimaSimulacion}` : ''}.
            Usar todos puede dejar a Excel sin respiro mientras simula.
          </span>
        </label>
      </div>
      <label className="campo casilla">
        <input
          type="checkbox"
          checked={congelar}
          onChange={(e) => {
            setCongelar(e.target.checked);
            guardarCongelarPantalla(e.target.checked);
          }}
        />
        <span>
          Congelar la pantalla al simular con Excel en el bucle
          <span className="tenue ayuda"> Las celdas no cambian a la vista mientras simula, y suele ir más rápido. Si la ventana parpadea, desmárcalo.</span>
        </span>
      </label>
    </section>
  );
}

/** Iteraciones: accesos rápidos más un campo libre. */
function CampoIteraciones({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  alCambiar: (n: number) => void;
}) {
  return (
    <div className="campo">
      <span className="tenue">{etiqueta}</span>
      <div className="presets" role="group" aria-label={etiqueta}>
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={n === valor ? 'activo' : 'plano'}
            aria-pressed={n === valor}
            onClick={() => alCambiar(n)}
          >
            {n >= 1_000_000 ? `${n / 1_000_000} M` : `${n / 1000} mil`}
          </button>
        ))}
      </div>
      <CampoEntero
        etiqueta="Otra cantidad"
        valor={valor}
        minimo={100}
        maximo={MAXIMO_ITERACIONES}
        alCambiar={alCambiar}
      />
    </div>
  );
}

function CampoEntero({
  etiqueta,
  ayuda,
  valor,
  minimo = 1,
  maximo = Number.MAX_SAFE_INTEGER,
  permitirNegativo,
  alCambiar,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: number;
  minimo?: number;
  maximo?: number;
  permitirNegativo?: boolean;
  alCambiar: (n: number) => void;
}) {
  const [texto, setTexto] = useState(miles(valor));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTexto(miles(valor)), [valor]);

  const confirmar = () => {
    const n = leerNumero(texto);
    const minimoReal = permitirNegativo ? Number.MIN_SAFE_INTEGER : minimo;
    if (n === null || !Number.isInteger(n) || n < minimoReal || n > maximo) {
      setError(
        permitirNegativo
          ? 'Escribe un número entero.'
          : `Escribe un entero entre ${miles(minimo)} y ${miles(maximo)}.`,
      );
      return;
    }
    setError(null);
    if (n !== valor) alCambiar(n);
    else setTexto(miles(valor));
  };

  return (
    <label className="campo">
      <span className="tenue">{etiqueta}</span>
      <input
        type="text"
        inputMode="numeric"
        value={texto}
        aria-invalid={error !== null}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && confirmar()}
      />
      {error ? <span className="aviso-linea">{error}</span> : ayuda && <span className="tenue ayuda">{ayuda}</span>}
    </label>
  );
}

/**
 * El título y la descripción del proyecto (C7): encabezan el informe PDF y el
 * volcado. Se guardan con el modelo al salir del campo, no a cada tecla.
 */
function Proyecto({ modelo, alCambiar }: { modelo: ModeloRiesgo; alCambiar: (m: ModeloRiesgo) => void }) {
  const [titulo, setTitulo] = useState(modelo.project?.title ?? '');
  const [descripcion, setDescripcion] = useState(modelo.project?.description ?? '');

  useEffect(() => {
    setTitulo(modelo.project?.title ?? '');
    setDescripcion(modelo.project?.description ?? '');
  }, [modelo.project]);

  const guardar = () => {
    const t = titulo.trim();
    const d = descripcion.trim();
    if (t === (modelo.project?.title ?? '') && d === (modelo.project?.description ?? '')) return;
    const copia = { ...modelo };
    if (t === '' && d === '') delete copia.project;
    else copia.project = { title: t, ...(d ? { description: d } : {}) };
    alCambiar(copia);
  };

  return (
    <section>
      <h2>Proyecto</h2>
      <p className="tenue">Encabezan el informe PDF y la hoja volcada. Se guardan en el libro.</p>
      <label className="campo ancho">
        <span className="tenue">Título</span>
        <input
          type="text"
          value={titulo}
          maxLength={LARGO_MAXIMO_TITULO}
          placeholder="p. ej. Proyecto Aurora — evaluación a cinco años"
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={guardar}
        />
      </label>
      <label className="campo ancho">
        <span className="tenue">Descripción</span>
        <textarea
          value={descripcion}
          rows={3}
          maxLength={LARGO_MAXIMO_DESCRIPCION}
          placeholder="Qué se evalúa, para quién y con qué supuestos."
          onChange={(e) => setDescripcion(e.target.value)}
          onBlur={guardar}
        />
      </label>
    </section>
  );
}
