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
}: {
  spec: DistributionSpec;
  alCambiar: (nueva: DistributionSpec) => void;
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

      {actual.type === 'discrete' ? (
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
