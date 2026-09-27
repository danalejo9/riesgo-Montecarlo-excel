/**
 * La pestaña del modelo: qué celdas son inciertas, qué se está midiendo y con
 * cuántas iteraciones.
 *
 * Es la parte del complemento con la que el usuario pasa más tiempo, así que
 * dos decisiones la gobiernan:
 *
 * **Se marca desde la selección, no escribiendo direcciones.** El usuario ya
 * tiene el cursor en la celda que le preocupa; pedirle que teclee `Flujo!D12`
 * es pedirle que se equivoque. El botón lee la selección, y si hay más de una
 * celda lo dice en vez de quedarse con la primera.
 *
 * **Se guarda solo, en el libro.** No hay botón de guardar: cada cambio
 * confirmado va a `workbook.settings`. Un panel que se puede cerrar sin querer
 * —y en Excel se cierra sin querer— no debe poder perder el trabajo de nadie.
 */

import { useCallback, useState } from 'react';

import { leerNombresSugeridos } from '../excel/etiquetasEnExcel.ts';
import { nombreUnico } from '../excel/nombreSugerido.ts';
import { aplicarResaltado, quitarResaltado } from '../excel/resaltado.ts';
import { leerSeleccion, type SeleccionLeida } from '../excel/seleccion.ts';
import {
  describirDistribucion,
  generarId,
  resumirDistribucion,
  type DistributionSpec,
  type EntradaRiskModel,
  type ModeloRiesgo,
  type SalidaRiskModel,
} from '../engine/modelo/index.ts';
import { medirRitmoEnExcel } from '../excel/simulacionCompatible.ts';
import { guardarRitmo, type RitmoGuardado } from '../excel/ritmo.ts';
import { convieneAvisar, tiempoEstimado } from '../engine/compatible/index.ts';
import { AjusteDatos } from './AjusteDatos.tsx';
import { Compartir, useFormulasCompartidas } from './Compartir.tsx';
import { EditorCorrelaciones } from './EditorCorrelaciones.tsx';
import { EditorDistribucion } from './EditorDistribucion.tsx';
import { miles } from './formato.ts';

const DISTRIBUCION_GENERICA: DistributionSpec = describirDistribucion('triangular')?.porDefecto ?? {
  type: 'triangular',
  min: 0,
  mode: 1,
  max: 2,
};

/**
 * La distribución que se propone al marcar una celda: una triangular de ±10 %
 * **alrededor del valor que ya tiene**.
 *
 * No es una estimación de nada —el usuario tiene que ajustarla— pero es un
 * punto de partida con el orden de magnitud correcto. Proponer (0; 1; 2) sobre
 * una celda que vale 1.200 obliga a borrar tres campos antes de poder pensar,
 * y con diez entradas eso es treinta campos.
 *
 * Con un cero o con una celda que no sea un número no hay magnitud de la que
 * partir, así que se deja la genérica en vez de inventar una.
 */
/**
 * Lo que tarda el modo compatible, **antes** de pulsar Simular.
 *
 * Esto no es una cortesía: medido en un libro real, el modo compatible da
 * **33 iteraciones por segundo**, así que el millón de iteraciones que el
 * motor rápido resuelve en 400 ms son aquí **ocho horas y media**. Ofrecer el
 * mismo desplegable en los dos modos, sin decir nada, es dejar que alguien se
 * comprometa a una jornada de espera con un clic.
 *
 * El ritmo se mide corriendo unas pocas iteraciones de verdad sobre el libro
 * del usuario, porque el coste lo pone su modelo y su máquina; no hay forma
 * honesta de estimarlo sin hacerlo. Una vez medido se guarda en el libro y no
 * hace falta repetirlo.
 */
function AvisoCompatible({
  modelo,
  ritmo,
  ocupado,
  alMedirRitmo,
  alFallar,
}: {
  modelo: ModeloRiesgo;
  ritmo: RitmoGuardado | null;
  ocupado: boolean;
  alMedirRitmo: (r: RitmoGuardado) => void;
  alFallar: (mensaje: string) => void;
}) {
  const [midiendo, setMidiendo] = useState(false);
  const n = modelo.settings.iterations;

  const medir = async () => {
    setMidiendo(true);
    try {
      const entradas = modelo.inputs.map((e) => ({ direccion: e.ref, muestras: new Float64Array([0]) }));
      const salidas = modelo.outputs.map((s) => s.ref);
      const r = await medirRitmoEnExcel(entradas, salidas);
      if (!r.ok) {
        alFallar(r.motivo);
        return;
      }
      const medido: RitmoGuardado = {
        iteracionesPorSegundo: r.iteracionesPorSegundo,
        medidoEn: new Date().toISOString(),
        celdas: 0,
      };
      alMedirRitmo(medido);
      await guardarRitmo(medido);
    } catch (e) {
      alFallar(e instanceof Error ? e.message : String(e));
    } finally {
      setMidiendo(false);
    }
  };

  return (
    <section>
      <h2>Con Excel en el bucle</h2>
      <p className="tenue">
        Este modo escribe cada iteración en tus celdas y deja que Excel
        recalcule. Funciona con cualquier libro y es lentísimo: no es el mismo
        producto más despacio, es otro trato.
      </p>

      {ritmo === null ? (
        <>
          <p className="tenue">
            Todavía no se ha medido el ritmo en este libro, así que no se puede
            decir cuánto va a tardar. Medirlo cuesta unos segundos.
          </p>
          <button type="button" onClick={() => void medir()} disabled={ocupado || midiendo || modelo.inputs.length === 0}>
            {midiendo ? 'Midiendo…' : 'Medir el ritmo'}
          </button>
        </>
      ) : (
        <>
          <dl>
            <dt>Ritmo medido</dt>
            <dd>{miles(ritmo.iteracionesPorSegundo)} iteraciones por segundo</dd>
            <dt>{miles(n)} iteraciones</dt>
            <dd>≈ {tiempoEstimado(ritmo.iteracionesPorSegundo, n)}</dd>
          </dl>

          {convieneAvisar(ritmo.iteracionesPorSegundo, n) && (
            <p className="aviso-linea">
              Es una espera muy larga. Con el motor rápido el mismo modelo tarda
              menos de un segundo; el compatible solo hace falta si tu libro usa
              funciones que el rápido no conoce. Baja las iteraciones o cambia
              de motor.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function distribucionInicial(valor: number | undefined): DistributionSpec {
  if (valor === undefined || !Number.isFinite(valor) || valor === 0) return DISTRIBUCION_GENERICA;
  const margen = Math.abs(valor) * 0.1;
  return { type: 'triangular', min: limpiar(valor - margen), mode: valor, max: limpiar(valor + margen) };
}

/**
 * Quita la basura binaria de una multiplicación: `0,1 × 1,1` da
 * `0,11000000000000001` en coma flotante, y ese número aparecería tal cual en
 * el campo y en el resumen de la entrada. No cambia nada del cálculo; cambia
 * que el panel no parezca roto nada más marcar una celda.
 */
function limpiar(v: number): number {
  return Number(v.toPrecision(12));
}

export function Modelo({
  modelo,
  alCambiar,
  alSimular,
  ocupado,
  ritmo,
  alMedirRitmo,
  alAbrirConfiguracion,
}: {
  modelo: ModeloRiesgo;
  alCambiar: (m: ModeloRiesgo) => void;
  alSimular: () => void;
  ocupado: boolean;
  /** El último ritmo medido del modo compatible en este libro, si lo hay. */
  ritmo: RitmoGuardado | null;
  alMedirRitmo: (r: RitmoGuardado) => void;
  alAbrirConfiguracion?: () => void;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [compartidas, setCompartidas] = useFormulasCompartidas();
  const preparadoParaCompartir = compartidas !== null && compartidas > 0;
  const compartir = (
    <Compartir modelo={modelo} alCambiar={alCambiar} guardadas={compartidas} setGuardadas={setCompartidas} />
  );

  /** La celda seleccionada, o un aviso de por qué no vale. */
  const celdaSeleccionada = useCallback(async (): Promise<SeleccionLeida | null> => {
    setAviso(null);
    const sel = await leerSeleccion();
    if (sel.filas * sel.columnas !== 1) {
      setAviso(`Has seleccionado ${sel.filas} × ${sel.columnas} celdas. Selecciona una sola.`);
      return null;
    }
    return sel;
  }, []);

  /**
   * El nombre con el que nace una celda marcada: el texto de su izquierda
   * («Precio unitario»), no «Modelo!C5» (E5). Si Excel no lo puede leer, la
   * referencia: un nombre feo no puede impedir marcar la celda.
   */
  const nombreLegible = useCallback(async (ref: string): Promise<string> => {
    const usados = [...modelo.inputs, ...modelo.outputs].map((x) => x.name);
    try {
      const nombre = (await leerNombresSugeridos([ref])).get(ref) ?? ref;
      return nombreUnico(nombre, ref, usados);
    } catch {
      return ref;
    }
  }, [modelo]);

  /** Para los modelos marcados antes del 27/09: nombrar desde la hoja lo que aún se llama como su celda. */
  const sinNombre = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name === x.ref);
  const nombrarDesdeLaHoja = useCallback(async () => {
    try {
      const refs = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name === x.ref).map((x) => x.ref);
      const sugeridos = await leerNombresSugeridos(refs);
      const usados = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name !== x.ref).map((x) => x.name);
      const nombrar = <T extends { name: string; ref: string }>(x: T): T => {
        if (x.name !== x.ref) return x;
        const nombre = nombreUnico(sugeridos.get(x.ref) ?? x.ref, x.ref, usados);
        usados.push(nombre);
        return { ...x, name: nombre };
      };
      alCambiar({ ...modelo, inputs: modelo.inputs.map(nombrar), outputs: modelo.outputs.map(nombrar) });
    } catch (e) {
      setAviso(`No se pudieron leer las etiquetas de la hoja: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [modelo, alCambiar]);

  const anadirEntrada = useCallback(async () => {
    const sel = await celdaSeleccionada();
    if (!sel) return;
    const ref = sel.direccion;
    if (modelo.inputs.some((e) => e.ref === ref) || modelo.outputs.some((s) => s.ref === ref)) {
      setAviso(`${ref} ya está en el modelo.`);
      return;
    }
    const entrada: EntradaRiskModel = {
      id: generarId('in'),
      name: await nombreLegible(ref),
      ref,
      dist: distribucionInicial(sel.valor),
      correlations: [],
    };
    alCambiar({ ...modelo, inputs: [...modelo.inputs, entrada] });
    setAbierta(entrada.id);
  }, [modelo, alCambiar, celdaSeleccionada, nombreLegible]);

  const anadirSalida = useCallback(async () => {
    const sel = await celdaSeleccionada();
    if (!sel) return;
    const ref = sel.direccion;
    if (modelo.inputs.some((e) => e.ref === ref) || modelo.outputs.some((s) => s.ref === ref)) {
      setAviso(`${ref} ya está en el modelo.`);
      return;
    }
    const salida: SalidaRiskModel = { id: generarId('out'), name: await nombreLegible(ref), ref };
    alCambiar({ ...modelo, outputs: [...modelo.outputs, salida] });
  }, [modelo, alCambiar, celdaSeleccionada, nombreLegible]);

  const cambiarEntrada = (id: string, cambio: Partial<EntradaRiskModel>) =>
    alCambiar({ ...modelo, inputs: modelo.inputs.map((e) => (e.id === id ? { ...e, ...cambio } : e)) });

  /**
   * Quitar una entrada se lleva también las correlaciones que la nombraban.
   * Si no, quedarían apuntando a algo que ya no existe: `validarRiskModel` lo
   * rechazaría y el modelo dejaría de poder guardarse, con un mensaje sobre un
   * identificador que el usuario nunca ha visto.
   */
  const quitarEntrada = (id: string) =>
    alCambiar({
      ...modelo,
      inputs: modelo.inputs
        .filter((e) => e.id !== id)
        .map((e) => ({ ...e, correlations: e.correlations.filter((c) => c.with !== id) })),
    });

  // Las entradas pueden venir también de funciones RIESGO.* escritas en el
  // libro, que solo se descubren al simular: basta con tener una salida.
  const listo = modelo.outputs.length > 0;

  return (
    <>
      {aviso && <p className="aviso-linea">{aviso}</p>}

      {preparadoParaCompartir && compartir}

      {sinNombre.length > 0 && (
        <p className="aviso-linea">
          {sinNombre.length === 1 ? 'Una celda se llama' : `${miles(sinNombre.length)} celdas se llaman`} como su
          referencia ({sinNombre.slice(0, 3).map((x) => x.ref).join(', ')}{sinNombre.length > 3 ? '…' : ''}).{' '}
          <button type="button" className="plano" onClick={() => void nombrarDesdeLaHoja()}>
            Poner nombres desde la hoja
          </button>
        </p>
      )}

      <section>
        <h2>Entradas inciertas</h2>
        <p className="tenue">
          Las celdas cuyo valor no conoces. Selecciona una en la hoja y añádela.
          {modelo.inputs.length >= 2 &&
            ' Despliega una (▸) para cambiarle la distribución o declarar que se mueve junto a otra.'}
        </p>

        {modelo.inputs.length === 0 && <p className="tenue">Todavía no hay ninguna.</p>}

        <ul className="fichas">
          {modelo.inputs.map((entrada) => (
            <li key={entrada.id}>
              <div className="cabecera">
                <button
                  type="button"
                  className="plano"
                  onClick={() => setAbierta(abierta === entrada.id ? null : entrada.id)}
                >
                  {abierta === entrada.id ? '▾' : '▸'} {entrada.name}
                </button>
                <span className="tenue">
                  {resumirDistribucion(entrada.dist)}
                  {entrada.correlations.length > 0 &&
                    ` · ${entrada.correlations.length} correlación(es)`}
                </span>
                <button
                  type="button"
                  className="plano borrar"
                  title="Quitar del modelo"
                  onClick={() => quitarEntrada(entrada.id)}
                >
                  ✕
                </button>
              </div>

              {abierta === entrada.id && (
                <div className="detalle">
                  <label className="campo ancho">
                    <span className="tenue">Nombre</span>
                    <input
                      type="text"
                      value={entrada.name}
                      onChange={(e) => cambiarEntrada(entrada.id, { name: e.target.value })}
                    />
                  </label>
                  <p className="tenue">Celda: {entrada.ref}</p>
                  <EditorDistribucion
                    spec={entrada.dist}
                    alCambiar={(dist) => cambiarEntrada(entrada.id, { dist })}
                  />
                  <AjusteDatos
                    decimal={modelo.settings.locale?.decimalSeparator ?? ','}
                    alUsar={(dist) => cambiarEntrada(entrada.id, { dist })}
                  />
                  <EditorCorrelaciones modelo={modelo} entrada={entrada} alCambiar={alCambiar} />
                </div>
              )}
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => void anadirEntrada()} disabled={ocupado}>
          Añadir la selección como entrada
        </button>
      </section>

      <section>
        <h2>Salidas</h2>
        <p className="tenue">Lo que quieres medir: el resultado del que verás la distribución.</p>

        {modelo.outputs.length === 0 && <p className="tenue">Todavía no hay ninguna.</p>}

        <ul className="fichas">
          {modelo.outputs.map((salida) => (
            <li key={salida.id}>
              <div className="cabecera">
                <input
                  type="text"
                  className="nombre-suelto"
                  value={salida.name}
                  onChange={(e) =>
                    alCambiar({
                      ...modelo,
                      outputs: modelo.outputs.map((s) =>
                        s.id === salida.id ? { ...s, name: e.target.value } : s,
                      ),
                    })
                  }
                />
                <span className="tenue">{salida.ref}</span>
                <button
                  type="button"
                  className="plano borrar"
                  title="Quitar del modelo"
                  onClick={() => alCambiar({ ...modelo, outputs: modelo.outputs.filter((s) => s.id !== salida.id) })}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => void anadirSalida()} disabled={ocupado}>
          Añadir la selección como salida
        </button>
      </section>

      <section>
        <h2>Resaltado en la hoja</h2>
        <p className="tenue">
          Las entradas se pintan de amarillo y las salidas de verde, el convenio
          de toda la vida en modelización financiera. Al quitarlo, cada celda
          vuelve al relleno que tenía.
        </p>
        <div className="botonera">
          <button type="button" onClick={() => void aplicarResaltado(modelo)} disabled={ocupado}>
            Resaltar en la hoja
          </button>
          <button type="button" onClick={() => void quitarResaltado()} disabled={ocupado}>
            Quitar el resaltado
          </button>
        </div>
      </section>

      <section>
        <h2>Ajustes</h2>
        <p className="tenue">
          {modelo.settings.convergence?.untilConverged
            ? `Hasta ±${(modelo.settings.convergence.target * 100).toLocaleString('es-ES')} % de precisión (tope ${miles(modelo.settings.convergence.maxIterations)})`
            : `${miles(modelo.settings.iterations)} iteraciones`}
          {' · '}semilla {modelo.settings.seed}
          {' · '}{modelo.settings.sampling === 'lhs' ? 'hipercubo latino' : 'Monte Carlo'}
          {' · '}motor {modelo.settings.engine === 'auto' ? 'automático' : modelo.settings.engine === 'fast' ? 'rápido' : 'compatible'}
        </p>
        {alAbrirConfiguracion && (
          <button type="button" className="plano" onClick={alAbrirConfiguracion}>
            ⚙ Cambiar en Configuración
          </button>
        )}
      </section>

      {!preparadoParaCompartir && compartir}

      {modelo.settings.engine === 'compatible' && (
        <AvisoCompatible
          modelo={modelo}
          ritmo={ritmo}
          ocupado={ocupado}
          alMedirRitmo={alMedirRitmo}
          alFallar={setAviso}
        />
      )}

      <section>
        <button type="button" className="principal" onClick={alSimular} disabled={ocupado || !listo}>
          {ocupado ? 'Simulando…' : 'Simular'}
        </button>
        {!listo && (
          <p className="tenue">
            Hace falta al menos una salida. Las entradas pueden ser celdas marcadas aquí o celdas
            con una función como =RIESGO.NORMAL(100; 15).
          </p>
        )}
      </section>
    </>
  );
}
