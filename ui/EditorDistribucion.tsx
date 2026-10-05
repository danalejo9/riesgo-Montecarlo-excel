/**
 * El editor de una distribución: un desplegable y sus parámetros.
 *
 * No sabe nada de ninguna distribución en concreto. Se pinta a partir de
 * `CATALOGO_DISTRIBUCIONES`, de modo que añadir una al motor la hace
 * aparecer aquí sin tocar este archivo — y, sobre todo, sin que se pueda
 * olvidar. Es la misma lección del catálogo del escáner: lo que hay que
 * acordarse de actualizar a mano acaba desactualizado.
 *
 * Los campos se editan como **texto** y no como `number`, a propósito.
 * Un `<input type="number">` controlado borra lo que el usuario está
 * escribiendo en cuanto el valor intermedio no es un número —escribir "-",
 * o "0," antes de los decimales— y hace imposible teclear un negativo. Se
 * guarda el texto mientras escribe y se convierte al salir del campo.
 *
 * Una combinación que no se puede muestrear (mínimo mayor que la moda…) **no
 * se guarda**: queda como borrador en el editor, con un aviso al lado, hasta
 * que el usuario la complete. Antes se guardaba y el panel entero mostraba un
 * error rojo que no se podía quitar (prueba del 27/09). Los números se leen en
 * formato español: "23.000" es veintitrés mil.
 */

import { useEffect, useState } from 'react';

import { categoriasDeRango } from '../excel/categoriasDeRango.ts';
import { leerNumero, numero, numeroEditable } from './formato.ts';

import {
  CATALOGO_DISTRIBUCIONES,
  GRUPOS_CATALOGO,
  describirDistribucion,
  problemaDeDistribucion,
  proponerDistribucion,
  TEXTO_CONFIANZA,
  type ConfianzaExtremos,
  vistaPrevia,
  type DistributionSpec,
  type TipoDistribucion,
} from '../engine/modelo/index.ts';

export function EditorDistribucion({
  spec,
  alCambiar,
  leerSeleccion,
}: {
  spec: DistributionSpec;
  alCambiar: (nueva: DistributionSpec) => void;
  /** Lee los valores de la selección de la hoja (para las categorías de una entrada de texto). */
  leerSeleccion?: () => Promise<unknown[][]>;
}) {
  // Lo que el usuario ha escrito y todavía no es una distribución válida.
  const [borrador, setBorrador] = useState<DistributionSpec | null>(null);
  const [conCatalogo, setConCatalogo] = useState(false);
  const [conAsistente, setConAsistente] = useState(false);
  const actual = borrador ?? spec;
  const desc = describirDistribucion(actual.type);
  const problema = borrador ? problemaDeDistribucion(borrador) : null;

  // Si la distribución cambia desde fuera (otro libro, ajuste a datos), el
  // borrador ya no tiene sentido.
  useEffect(() => setBorrador(null), [spec]);

  // Al cambiar de tipo se parte del ejemplo por defecto: los parámetros de
  // una no significan nada en otra, y conservarlos por nombre daría una PERT
  // con la desviación de una normal.
  const elegirTipo = (tipo: TipoDistribucion) => {
    if (tipo === actual.type) return;
    const nueva = describirDistribucion(tipo)?.porDefecto;
    if (nueva) {
      setBorrador(null);
      alCambiar(nueva);
    }
  };

  const intentar = (nueva: DistributionSpec) => {
    if (problemaDeDistribucion(nueva) === null) {
      setBorrador(null);
      alCambiar(nueva);
    } else {
      setBorrador(nueva);
    }
  };

  return (
    <div className="distribucion">
      <label>
        <span className="tenue">Distribución</span>
        <select
          value={actual.type}
          onChange={(e) => elegirTipo(e.target.value as TipoDistribucion)}
        >
          {CATALOGO_DISTRIBUCIONES.map((d) => (
            <option key={d.tipo} value={d.tipo}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>

      {desc && <p className="tenue">{desc.cuando}</p>}
      <button type="button" className="secundario enlace-catalogo" onClick={() => setConCatalogo((v) => !v)} aria-expanded={conCatalogo}>
        {conCatalogo ? 'Ocultar el catálogo' : '¿Cuál elegir? Ver el catálogo'}
      </button>
      {actual.type !== 'categorical' && (
        <button type="button" className="secundario enlace-catalogo" onClick={() => setConAsistente((v) => !v)} aria-expanded={conAsistente}>
          {conAsistente ? 'Cerrar el asistente' : 'Asistente: dígamelo en palabras'}
        </button>
      )}
      {conAsistente && (
        <AsistenteExperto
          alUsar={(nueva) => {
            setBorrador(null);
            alCambiar(nueva);
            setConAsistente(false);
          }}
        />
      )}
      {conCatalogo && (
        <Catalogo
          actual={actual.type}
          alElegir={(t) => {
            elegirTipo(t);
            setConCatalogo(false);
          }}
        />
      )}

      {actual.type === 'categorical' ? (
        <EditorCategorica spec={actual} alCambiar={intentar} {...(leerSeleccion ? { leerSeleccion } : {})} />
      ) : actual.type === 'discrete' ? (
        <EditorDiscreta spec={actual} alCambiar={intentar} />
      ) : actual.type === 'histogram' ? (
        <div className="parametros">
          {desc?.parametros.map((p) => (
            <CampoNumero
              key={p.clave}
              etiqueta={p.etiqueta}
              ayuda={p.ayuda}
              valor={(actual as unknown as Record<string, number | undefined>)[p.clave]}
              alCambiar={(v) => intentar({ ...actual, [p.clave]: v } as DistributionSpec)}
            />
          ))}
          <CampoLista
            etiqueta="Pesos de los tramos"
            ayuda="Uno por tramo, de izquierda a derecha. No hace falta que sumen 1."
            valores={actual.weights}
            alCambiar={(weights) => intentar({ ...actual, weights })}
          />
        </div>
      ) : (
        <div className="parametros">
          {desc?.parametros.map((p) => (
            <CampoNumero
              key={p.clave}
              etiqueta={p.etiqueta}
              ayuda={p.ayuda}
              valor={(actual as unknown as Record<string, number | undefined>)[p.clave]}
              alCambiar={(v) => intentar({ ...actual, [p.clave]: v } as DistributionSpec)}
            />
          ))}
        </div>
      )}

      {actual.type !== 'categorical' && (
        <div className="parametros acotar">
          <CampoOpcional
            etiqueta="Acotar: mínimo"
            valor={actual.truncate?.min}
            alCambiar={(min) => intentar(conLimites(actual, { ...actual.truncate, min }))}
          />
          <CampoOpcional
            etiqueta="Acotar: máximo"
            valor={actual.truncate?.max}
            alCambiar={(max) => intentar(conLimites(actual, { ...actual.truncate, max }))}
          />
        </div>
      )}

      {!problema && <VistaPreviaDistribucion spec={actual} />}

      {problema && (
        <p className="aviso-linea" role="alert">
          Así todavía no es válida y no se guarda: {problema}. Se sigue usando{' '}
          la anterior hasta que lo corrijas.
        </p>
      )}
    </div>
  );
}

/**
 * El catálogo visual (U3.3): cada distribución con su forma en miniatura y
 * cuándo usarla, agrupadas por lo que se sabe. Elegir una es lo mismo que
 * elegirla en el desplegable.
 */
function Catalogo({ actual, alElegir }: { actual: TipoDistribucion; alElegir: (t: TipoDistribucion) => void }) {
  return (
    <div className="catalogo">
      {GRUPOS_CATALOGO.map((g) => (
        <section key={g.titulo}>
          <h4>{g.titulo}</h4>
          <div className="catalogo-rejilla">
            {g.tipos.map((t) => {
              const d = describirDistribucion(t);
              if (!d) return null;
              return (
                <button key={t} type="button" className={`catalogo-ficha${t === actual ? ' elegida' : ''}`} aria-pressed={t === actual} onClick={() => alElegir(t)}>
                  <Miniatura spec={d.porDefecto} />
                  <strong>{d.nombre}</strong>
                  <span className="tenue">{d.cuando}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** La forma, en pequeño: la curva de una continua o las barras de una discreta. */
function Miniatura({ spec }: { spec: DistributionSpec }) {
  const v = vistaPrevia(spec);
  const ancho = 72;
  const alto = 28;
  if (!v) return <svg className="miniatura" width={ancho} height={alto} aria-hidden="true" />;
  if (v.tipo === 'continua') {
    const xs = v.puntos.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const yMax = v.puntos.reduce((m, p) => Math.max(m, p.y), 0) || 1;
    const px = (x: number) => ((x - x0) / (x1 - x0 || 1)) * ancho;
    const py = (y: number) => alto - (y / yMax) * (alto - 2);
    const d = `M0 ${alto} ${v.puntos.map((p) => `L${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ')} L${ancho} ${alto} Z`;
    return <svg className="miniatura" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true"><path d={d} /></svg>;
  }
  const barras = v.barras.slice(0, 24);
  const pMax = barras.reduce((m, b) => Math.max(m, b.p), 0) || 1;
  const w = ancho / Math.max(barras.length, 1);
  return (
    <svg className="miniatura" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      {barras.map((b, i) => {
        const h = (b.p / pMax) * (alto - 2);
        return <rect key={i} x={i * w + w * 0.15} y={alto - h} width={w * 0.7} height={h} />;
      })}
    </svg>
  );
}

/**
 * La forma de la distribución y sus percentiles mientras se edita (C5): para
 * no elegir parámetros a ciegas.
 */
function VistaPreviaDistribucion({ spec }: { spec: DistributionSpec }) {
  const v = vistaPrevia(spec);
  if (!v) return null;
  const W = 280;
  const H = 70;
  const M = 4;
  let figura: React.ReactNode;
  if (v.tipo === 'continua') {
    const xs = v.puntos.map((p) => p.x);
    const x0 = xs[0] as number;
    const x1 = xs[xs.length - 1] as number;
    const yMax = Math.max(...v.puntos.map((p) => p.y), 1e-300);
    const aX = (x: number) => M + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * M);
    const aY = (y: number) => H - M - (y / yMax) * (H - 2 * M);
    const linea = v.puntos.map((p) => `${aX(p.x).toFixed(1)},${aY(p.y).toFixed(1)}`).join(' ');
    figura = (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forma de la distribución">
        <polygon className="previa-area" points={`${aX(x0)},${H - M} ${linea} ${aX(x1)},${H - M}`} />
        {[v.p5, v.p95].map((x, i) => <line key={i} className="previa-p" x1={aX(x)} x2={aX(x)} y1={M} y2={H - M} />)}
        <line className="previa-p50" x1={aX(v.p50)} x2={aX(v.p50)} y1={M} y2={H - M} />
      </svg>
    );
  } else {
    const pMax = Math.max(...v.barras.map((b) => b.p), 1e-9);
    const ancho = (W - 2 * M) / v.barras.length;
    figura = (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Probabilidad de cada valor">
        {v.barras.map((b, i) => {
          const h = (b.p / pMax) * (H - 2 * M);
          return <rect key={i} className="previa-barra" x={M + i * ancho + 1} y={H - M - h} width={Math.max(1, ancho - 2)} height={h}><title>{`${b.etiqueta}: ${(b.p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</title></rect>;
        })}
      </svg>
    );
  }
  return (
    <figure className="vista-previa">
      {figura}
      <figcaption className="tenue">
        {v.p5 !== undefined && v.p50 !== undefined && v.p95 !== undefined
          // Tres cifras significativas: es para hacerse una idea de la forma,
          // no para leer decimales (A2, ronda del 29/09: «0,010654» amontonaba).
          ? `p5 ${numero(v.p5, 3)}  ·  p50 ${numero(v.p50, 3)}  ·  p95 ${numero(v.p95, 3)}${v.media !== undefined ? `  ·  media ${numero(v.media, 3)}` : ''}`
          : 'Probabilidad de cada valor (pasa el ratón por una barra).'}
      </figcaption>
    </figure>
  );
}

/**
 * La discreta no tiene parámetros numéricos sino dos listas paralelas, y por
 * eso se edita aparte en vez de forzarla al molde de las demás. Se escriben
 * separadas por comas porque es como el usuario las tiene ya escritas en algún
 * sitio, y pedirle una fila por valor sería más trabajo para lo mismo.
 */
function EditorDiscreta({
  spec,
  alCambiar,
}: {
  spec: Extract<DistributionSpec, { type: 'discrete' }>;
  alCambiar: (nueva: DistributionSpec) => void;
}) {
  return (
    <div className="parametros">
      <CampoLista
        etiqueta="Valores"
        valores={spec.values}
        alCambiar={(values) => alCambiar({ ...spec, values })}
      />
      <CampoLista
        etiqueta="Pesos"
        ayuda="Uno por valor. No hace falta que sumen 1."
        valores={spec.weights}
        alCambiar={(weights) => alCambiar({ ...spec, weights })}
      />
    </div>
  );
}

/**
 * Una entrada de texto (T1): las categorías y sus pesos, escritos separados
 * por punto y coma, o leídos de la selección (nombres en la primera columna,
 * probabilidades en la segunda).
 */
function EditorCategorica({
  spec,
  alCambiar,
  leerSeleccion,
}: {
  spec: Extract<DistributionSpec, { type: 'categorical' }>;
  alCambiar: (nueva: DistributionSpec) => void;
  leerSeleccion?: () => Promise<unknown[][]>;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState(spec.categories.join('; '));
  useEffect(() => setTexto(spec.categories.join('; ')), [spec.categories]);

  const leer = async () => {
    if (!leerSeleccion) return;
    setAviso(null);
    try {
      const r = categoriasDeRango(await leerSeleccion());
      if (!r.ok) {
        setAviso(r.motivo);
        return;
      }
      alCambiar({ type: 'categorical', categories: r.categories, weights: r.weights });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="parametros">
      <label className="campo ancho">
        <span className="tenue">Categorías</span>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const nombres = texto.split(';').map((x) => x.trim()).filter((x) => x.length > 0);
            if (nombres.length === 0 || nombres.join('; ') === spec.categories.join('; ')) {
              setTexto(spec.categories.join('; '));
              return;
            }
            // Cada nombre conserva su peso si ya existía; los nuevos, peso 1.
            const peso = new Map(spec.categories.map((c, i) => [c, spec.weights[i] ?? 1] as const));
            alCambiar({ type: 'categorical', categories: nombres, weights: nombres.map((n) => peso.get(n) ?? 1) });
          }}
        />
        <span className="tenue ayuda">Separadas por punto y coma: Norte; Sur; Este.</span>
      </label>
      <CampoLista
        etiqueta="Pesos"
        ayuda="Uno por categoría, en el mismo orden. No hace falta que sumen 1 ni 100."
        valores={spec.weights}
        alCambiar={(weights) => alCambiar({ ...spec, weights })}
      />
      {leerSeleccion && (
        <div className="ancho">
          <button type="button" className="secundario" onClick={() => void leer()}>
            Leer de la selección
          </button>
          <span className="tenue ayuda"> Selecciona en la hoja los nombres y, al lado, sus probabilidades.</span>
        </div>
      )}
      {aviso && <p className="aviso-linea">{aviso}</p>}
    </div>
  );
}

/** La distribución con otros límites; sin ninguno, deja de estar acotada (B4). */
function conLimites(spec: DistributionSpec, t: { min?: number | undefined; max?: number | undefined }): DistributionSpec {
  const limpio: { min?: number; max?: number } = {};
  if (t.min !== undefined) limpio.min = t.min;
  if (t.max !== undefined) limpio.max = t.max;
  const copia = { ...spec };
  if (limpio.min === undefined && limpio.max === undefined) delete copia.truncate;
  else copia.truncate = limpio;
  return copia;
}

/**
 * El asistente de juicio experto (V4): cuatro preguntas en palabras y la
 * distribución que les corresponde, con su forma, antes de usarla.
 */
function AsistenteExperto({ alUsar }: { alUsar: (spec: DistributionSpec) => void }) {
  const [minimo, setMinimo] = useState<number | undefined>(undefined);
  const [maximo, setMaximo] = useState<number | undefined>(undefined);
  const [masProbable, setMasProbable] = useState<number | undefined>(undefined);
  const [noSe, setNoSe] = useState(false);
  const [confianza, setConfianza] = useState<ConfianzaExtremos>('uno-de-10');
  const completo = minimo !== undefined && maximo !== undefined && (noSe || masProbable !== undefined);
  const propuesta = completo
    ? proponerDistribucion({ minimo, maximo, ...(noSe ? {} : { masProbable }), confianza })
    : null;
  return (
    <section className="asistente-experto">
      <p className="tenue">Responda como lo diría en una reunión; el complemento elige la distribución.</p>
      <div className="parametros">
        <CampoOpcional vacio="" etiqueta="¿Lo mínimo razonable?" valor={minimo} alCambiar={setMinimo} />
        <CampoOpcional vacio="" etiqueta="¿Lo máximo razonable?" valor={maximo} alCambiar={setMaximo} />
        {!noSe && <CampoOpcional vacio="" etiqueta="¿Lo más probable?" valor={masProbable} alCambiar={setMasProbable} />}
      </div>
      <label className="casilla">
        <input type="checkbox" checked={noSe} onChange={(e) => setNoSe(e.target.checked)} /> No sé cuál es lo más probable
      </label>
      <fieldset className="opciones-confianza">
        <legend className="tenue">¿Qué tan seguro está de esos extremos?</legend>
        {(Object.keys(TEXTO_CONFIANZA) as ConfianzaExtremos[]).map((c) => (
          <label key={c} className="casilla">
            <input type="radio" name="confianza-experto" checked={confianza === c} onChange={() => setConfianza(c)} /> {TEXTO_CONFIANZA[c]}
          </label>
        ))}
      </fieldset>
      {typeof propuesta === 'string' && <p className="aviso-linea" role="alert">{propuesta}</p>}
      {propuesta && typeof propuesta !== 'string' && (
        <>
          <p>{propuesta.explicacion}</p>
          {propuesta.avisos.map((a, i) => <p key={i} className="tenue">{a}</p>)}
          <VistaPreviaDistribucion spec={propuesta.spec} />
          <button type="button" onClick={() => alUsar(propuesta.spec)}>Usar esta distribución</button>
        </>
      )}
    </section>
  );
}

/** Un número que puede quedar vacío (un límite opcional). */
function CampoOpcional({ etiqueta, valor, alCambiar, vacio = 'sin límite' }: { etiqueta: string; valor: number | undefined; alCambiar: (v: number | undefined) => void; vacio?: string }) {
  const [texto, setTexto] = useState(numeroEditable(valor));
  useEffect(() => setTexto(numeroEditable(valor)), [valor]);
  return (
    <label className="campo">
      <span className="tenue">{etiqueta}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={vacio}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto === numeroEditable(valor)) return;
          if (texto.trim() === '') return alCambiar(undefined);
          const n = leerNumero(texto);
          if (n !== null) alCambiar(n);
          else setTexto(numeroEditable(valor));
        }}
      />
    </label>
  );
}

function CampoNumero({
  etiqueta,
  ayuda,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: number | undefined;
  alCambiar: (v: number) => void;
}) {
  const [texto, setTexto] = useState(numeroEditable(valor));

  // Si el valor cambia desde fuera (cambio de tipo, modelo recargado), el
  // campo tiene que seguirlo; mientras el usuario escribe, manda el texto.
  useEffect(() => {
    setTexto(numeroEditable(valor));
  }, [valor]);

  return (
    <label className="campo">
      <span className="tenue">{etiqueta}</span>
      <input
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto === numeroEditable(valor)) return;
          const n = leerNumero(texto);
          if (n !== null) alCambiar(n);
          else setTexto(numeroEditable(valor));
        }}
      />
      {ayuda && <span className="tenue ayuda">{ayuda}</span>}
    </label>
  );
}

function CampoLista({
  etiqueta,
  ayuda,
  valores,
  alCambiar,
}: {
  etiqueta: string;
  ayuda?: string;
  valores: number[];
  alCambiar: (v: number[]) => void;
}) {
  const [texto, setTexto] = useState(valores.join('; '));

  useEffect(() => {
    setTexto(valores.join('; '));
  }, [valores]);

  return (
    <label className="campo ancho">
      <span className="tenue">{etiqueta}</span>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const partes = texto
            .split(/[;,\s]+/)
            .filter((s) => s.length > 0)
            .map((s) => Number(s.replace(',', '.')));
          if (partes.length > 0 && partes.every((n) => Number.isFinite(n))) alCambiar(partes);
          else setTexto(valores.join('; '));
        }}
      />
      {ayuda && <span className="tenue ayuda">{ayuda}</span>}
    </label>
  );
}
