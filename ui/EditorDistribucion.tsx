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
import { leerNumero, numeroEditable } from './formato.ts';

import {
  CATALOGO_DISTRIBUCIONES,
  describirDistribucion,
  problemaDeDistribucion,
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
  const actual = borrador ?? spec;
  const desc = describirDistribucion(actual.type);
  const problema = borrador ? problemaDeDistribucion(borrador) : null;

  // Si la distribución cambia desde fuera (otro libro, ajuste a datos), el
  // borrador ya no tiene sentido.
  useEffect(() => setBorrador(null), [spec]);

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
          onChange={(e) => {
            const tipo = e.target.value as TipoDistribucion;
            // Al cambiar de tipo se parte del ejemplo por defecto: los
            // parámetros de una no significan nada en otra, y conservarlos
            // por nombre daría una PERT con la desviación de una normal.
            const nueva = describirDistribucion(tipo)?.porDefecto;
            if (nueva) {
              setBorrador(null);
              alCambiar(nueva);
            }
          }}
        >
          {CATALOGO_DISTRIBUCIONES.map((d) => (
            <option key={d.tipo} value={d.tipo}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>

      {desc && <p className="tenue">{desc.cuando}</p>}

      {actual.type === 'categorical' ? (
        <EditorCategorica spec={actual} alCambiar={intentar} {...(leerSeleccion ? { leerSeleccion } : {})} />
      ) : actual.type === 'discrete' ? (
        <EditorDiscreta spec={actual} alCambiar={intentar} />
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
        <button type="button" className="plano" onClick={() => void leer()}>
          Leer de la selección (nombres y probabilidades)
        </button>
      )}
      {aviso && <p className="aviso-linea">{aviso}</p>}
    </div>
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
