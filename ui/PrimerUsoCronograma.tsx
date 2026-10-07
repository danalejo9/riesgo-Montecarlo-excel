/**
 * W6: la guía de primeros pasos del módulo Cronograma. Cinco pasos, cada uno
 * marcado como hecho según lo que ya pasó en el panel. Se puede ocultar (se
 * recuerda en este navegador) y volver a abrir.
 */

import { useState } from 'react';

const CLAVE = 'riesgoMontecarlo.cronograma.primerUso.oculta';

const PASOS: readonly { titulo: string; texto: string }[] = [
  { titulo: 'Cree las hojas', texto: 'Con el ejemplo de su sector (lo más rápido para aprender) o importando de MS Project o P6.' },
  { titulo: 'Revise la calidad', texto: 'El semáforo dice qué corregir antes de simular: lógica, restricciones, rangos de duración.' },
  { titulo: 'Complete la incertidumbre y los riesgos', texto: 'Rangos en Incertidumbre («Rellenar rangos vacíos» da un punto de partida), y en Riesgos e Impactos la probabilidad y a qué actividades afecta cada uno.' },
  { titulo: 'Simule', texto: 'P50 y P80, la probabilidad de cumplir la meta y los hitos del contrato, la reserva de contingencia, los riesgos que más pesan y el informe ejecutivo.' },
  { titulo: 'Haga seguimiento', texto: 'Cada corte, «Guardar en el seguimiento» para ver si el riesgo del cronograma crece o baja; «Comparar escenarios» para decidir qué hacer.' },
];

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
        <button type="button" className="enlace" onClick={() => { guardarOculta(false); setOculta(false); }}>Primeros pasos</button>
      </p>
    );
  }
  return (
    <div className="primer-uso">
      <h3>Primeros pasos</h3>
      <ol>
        {PASOS.map((p, i) => (
          <li key={p.titulo} className={hechos[i] ? 'hecho' : undefined}>
            <strong>{p.titulo}</strong>{hechos[i] ? ' ✓' : ''}. <span className="tenue">{p.texto}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="secundario" onClick={() => { guardarOculta(true); setOculta(true); }}>Ocultar</button>
    </div>
  );
}
