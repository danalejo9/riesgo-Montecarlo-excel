/**
 * Declarar que dos entradas no son independientes.
 *
 * Es la pieza que faltaba para que una capacidad construida en la Fase 2
 * —Iman–Conover, con sus grupos y su matriz— dejara de ser inalcanzable: hasta
 * ahora solo se podía declarar una correlación editando a mano el JSON del
 * modelo.
 *
 * **Y no es un adorno estadístico.** Simular el precio y las unidades como
 * independientes supone que pueden caer las unidades mientras el precio sube,
 * en la misma proporción que cualquier otra combinación. Rara vez es cierto, y
 * el error va siempre en la misma dirección: la independencia **diluye** el
 * riesgo, porque los malos escenarios de una variable se compensan con los
 * buenos de la otra. El p5 sale mejor de lo que es, que es exactamente el
 * número en el que alguien se va a apoyar para decidir.
 *
 * ---
 *
 * **La simetría se escribe, no se pide.** Una correlación es una relación
 * entre dos, y el formato la guarda en las dos entradas. Si se dejara al
 * usuario declararla desde cada lado, podría poner 0,6 en una y 0,3 en la
 * otra, y `agruparCorrelaciones` lo rechazaría con razón. Aquí cada cambio
 * escribe **los dos lados a la vez**, así que la contradicción no se puede ni
 * teclear.
 *
 * Lo que sí puede seguir siendo imposible es el conjunto: "A va con B, B va
 * con C, y A va al revés que C" no describe ninguna realidad. Eso no se puede
 * evitar campo a campo —depende de toda la matriz—: `agruparCorrelaciones`
 * usa la matriz posible más cercana (Higham) y avisa, nombrando a los
 * implicados, de cuánto cambió cada coeficiente.
 */

import { useEffect, useState } from 'react';

import type { EntradaRiskModel, ModeloRiesgo } from '../engine/modelo/index.ts';

export function EditorCorrelaciones({
  modelo,
  entrada,
  alCambiar,
}: {
  modelo: ModeloRiesgo;
  entrada: EntradaRiskModel;
  alCambiar: (m: ModeloRiesgo) => void;
}) {
  const otras = modelo.inputs.filter((e) => e.id !== entrada.id);
  const declaradas = new Map(entrada.correlations.map((c) => [c.with, c.coefficient] as const));
  const sinDeclarar = otras.filter((o) => !declaradas.has(o.id));

  /** Escribe (o borra) la correlación en las dos entradas a la vez. */
  const fijar = (otroId: string, coeficiente: number | null) => {
    const inputs = modelo.inputs.map((e) => {
      const esUnaDeLasDos = e.id === entrada.id || e.id === otroId;
      if (!esUnaDeLasDos) return e;

      const pareja = e.id === entrada.id ? otroId : entrada.id;
      const resto = e.correlations.filter((c) => c.with !== pareja);
      return {
        ...e,
        correlations: coeficiente === null ? resto : [...resto, { with: pareja, coefficient: coeficiente }],
      };
    });
    alCambiar({ ...modelo, inputs });
  };

  if (otras.length === 0) {
    return (
      <p className="tenue">
        Las correlaciones se declaran entre dos entradas. Añade otra y aparecerán aquí.
      </p>
    );
  }

  return (
    <div className="correlaciones">
      <h4>Correlación con otras entradas</h4>

      {declaradas.size === 0 && (
        <p className="tenue">
          Sin declarar nada, se simulan como independientes. Si en la realidad se
          mueven juntas, eso hace que el riesgo parezca menor del que es.
        </p>
      )}

      {entrada.correlations.map((c) => {
        const otra = otras.find((o) => o.id === c.with);
        if (!otra) return null; // la otra entrada ya no existe; validarRiskModel lo reporta
        return (
          <CampoCoeficiente
            key={c.with}
            nombre={otra.name}
            valor={c.coefficient}
            alCambiar={(v) => fijar(c.with, v)}
            alQuitar={() => fijar(c.with, null)}
          />
        );
      })}

      {sinDeclarar.length > 0 && (
        <label className="campo ancho">
          <span className="tenue">Añadir correlación con</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) fijar(e.target.value, 0.5);
            }}
          >
            <option value="">Elige una entrada…</option>
            {sinDeclarar.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * Un coeficiente entre -1 y 1, con un deslizador **y** un número.
 *
 * El deslizador porque un coeficiente de correlación es una intuición ("van
 * bastante juntos"), no una medición, y arrastrar es la forma honesta de
 * expresar una intuición. El número porque quien venga de un estudio con un
 * 0,62 tiene que poder escribirlo.
 */
function CampoCoeficiente({
  nombre,
  valor,
  alCambiar,
  alQuitar,
}: {
  nombre: string;
  valor: number;
  alCambiar: (v: number) => void;
  alQuitar: () => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);

  return (
    <div className="correlacion">
      <div className="cabecera">
        <span className="nombre">{nombre}</span>
        <input
          type="text"
          inputMode="decimal"
          className="coeficiente"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const n = Number(texto.replace(',', '.'));
            // Fuera de [-1, 1] no es un coeficiente de correlación: se acota en
            // vez de rechazarlo, que es lo que espera quien escribe "1,2".
            if (Number.isFinite(n)) alCambiar(Math.min(1, Math.max(-1, n)));
            else setTexto(String(valor));
          }}
        />
        <button type="button" className="plano borrar" title="Quitar la correlación" onClick={alQuitar}>
          ✕
        </button>
      </div>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={valor}
        onChange={(e) => alCambiar(Number(e.target.value))}
      />
      <span className="tenue">{describir(valor)}</span>
    </div>
  );
}

/**
 * El coeficiente en palabras. Un 0,7 no le dice nada a quien no trabaje con
 * estadística, y este panel es para quien hace presupuestos.
 */
function describir(r: number): string {
  const fuerza =
    Math.abs(r) < 0.05 ? 'prácticamente independientes'
    : Math.abs(r) < 0.3 ? 'se mueven algo'
    : Math.abs(r) < 0.6 ? 'se mueven bastante'
    : Math.abs(r) < 0.9 ? 'se mueven mucho'
    : 'casi la misma variable';

  if (Math.abs(r) < 0.05) return fuerza;
  return r > 0 ? `${fuerza} en el mismo sentido` : `${fuerza} en sentido contrario`;
}

/** La correlación de una celda de la matriz, escrita a mano: «0,6», «-0,3», «» (sin correlación). */
function leerCoeficiente(texto: string): number | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= -1 && v <= 1 ? v : undefined;
}

/**
 * La matriz de correlaciones entera (E2): todas las entradas numéricas en
 * filas y columnas, editable en el triángulo de arriba (el de abajo es su
 * espejo). Escribe los dos lados a la vez, como el editor de cada entrada, y
 * dice debajo si el conjunto es imposible.
 */
export function MatrizCorrelaciones({ modelo, alCambiar, problemas }: { modelo: ModeloRiesgo; alCambiar: (m: ModeloRiesgo) => void; problemas: readonly string[] }) {
  const entradas = modelo.inputs.filter((e) => e.dist.type !== 'categorical');
  const [editando, setEditando] = useState<{ clave: string; texto: string } | null>(null);
  if (entradas.length < 2) return <p className="tenue">Hacen falta al menos dos entradas numéricas.</p>;
  const coef = (a: EntradaRiskModel, b: EntradaRiskModel) =>
    a.correlations.find((c) => c.with === b.id)?.coefficient ?? b.correlations.find((c) => c.with === a.id)?.coefficient;
  const fijar = (a: string, b: string, v: number | null) => {
    const inputs = modelo.inputs.map((e) => {
      if (e.id !== a && e.id !== b) return e;
      const pareja = e.id === a ? b : a;
      const resto = e.correlations.filter((c) => c.with !== pareja);
      return { ...e, correlations: v === null || v === 0 ? resto : [...resto, { with: pareja, coefficient: v }] };
    });
    alCambiar({ ...modelo, inputs });
  };
  const corto = (t: string) => (t.length > 10 ? `${t.slice(0, 9)}…` : t);
  return (
    <div className="matriz-correlaciones">
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead>
            <tr>
              <th />
              {entradas.map((e, j) => <th key={e.id} title={e.name}>{j + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {entradas.map((a, i) => (
              <tr key={a.id}>
                <th scope="row" title={a.name}>{i + 1}. {corto(a.name)}</th>
                {entradas.map((b, j) => {
                  if (i === j) return <td key={b.id} className="diagonal">1</td>;
                  const v = coef(a, b);
                  if (j < i) return <td key={b.id} className="tenue">{v === undefined ? '' : v.toLocaleString('es-ES')}</td>;
                  const clave = `${a.id}|${b.id}`;
                  const texto = editando?.clave === clave ? editando.texto : v === undefined ? '' : v.toLocaleString('es-ES');
                  const invalido = editando?.clave === clave && leerCoeficiente(editando.texto) === undefined;
                  return (
                    <td key={b.id}>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="celda-matriz"
                        aria-label={`Correlación entre ${a.name} y ${b.name}`}
                        aria-invalid={invalido}
                        value={texto}
                        placeholder="0"
                        onChange={(e) => setEditando({ clave, texto: e.target.value })}
                        onBlur={() => {
                          if (editando?.clave === clave) {
                            const x = leerCoeficiente(editando.texto);
                            if (x !== undefined) fijar(a.id, b.id, x);
                          }
                          setEditando(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Escribe en el triángulo de arriba un número entre -1 y 1 (0,8: suben juntas; -0,5: una sube cuando la otra
        baja); vacío o 0, independientes. El de abajo es su espejo. Las entradas de texto no se correlacionan.
      </p>
      {problemas.length > 0 && <ul className="aviso-linea">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
}
