/**
 * W6: la guía de primer uso del módulo Cronograma. Cinco pasos, cada uno
 * marcado como hecho según lo que ya pasó en el panel. Se puede ocultar (se
 * recuerda en este navegador) y volver a abrir.
 */

import { useState } from 'react';

import { textosCronograma as T } from './textos/es.ts';

const CLAVE = 'riesgoMontecarlo.cronograma.primerUso.oculta';

function leerOculta(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

function guardarOculta(v: boolean): void {
  try {
    if (v) globalThis.localStorage?.setItem(CLAVE, '1');
    else globalThis.localStorage?.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento: se vuelve a enseñar la próxima vez. No pasa nada.
  }
}

/** `hechos[i]`: si el paso i ya se hizo en esta sesión del panel. */
export function PrimerUso({ hechos }: { hechos: readonly boolean[] }) {
  const [oculta, setOculta] = useState(leerOculta);
  if (oculta) {
    return (
      <p className="tenue">
        <button type="button" className="enlace" onClick={() => { guardarOculta(false); setOculta(false); }}>{T.verGuia}</button>
      </p>
    );
  }
  return (
    <div className="primer-uso">
      <h3>{T.primerUso}</h3>
      <p className="tenue">{T.primerUsoIntro}</p>
      <ol>
        {T.pasos.map((p, i) => (
          <li key={p.titulo} className={hechos[i] ? 'hecho' : undefined}>
            <strong>{p.titulo}</strong>{hechos[i] ? ` ✓ ${T.hecho}` : ''}. <span className="tenue">{p.texto}</span>
          </li>
        ))}
      </ol>
      <p className="tenue">{T.primerUsoCostos}</p>
      <button type="button" onClick={() => { guardarOculta(true); setOculta(true); }}>{T.ocultarGuia}</button>
    </div>
  );
}
