/**
 * El banco de pruebas: el panel de verdad, sobre un Excel de mentira.
 *
 * Sirve para desarrollar la interfaz sin Excel delante y para poder mirarla en
 * cualquier máquina. Lo que aquí funciona **no está verificado en Excel**: ver
 * el docstring de `excelFalso.ts`, que dice exactamente qué no puede cazar.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Panel } from '../Panel.tsx';
import '../estilos.css';
import { avisarSeleccion, CELDAS, hojasMatriz, hojaVolcada, instalarExcelFalso, rellenos, seleccion, avisarCambioHoja } from './excelFalso.ts';
import { pedirAlPanel } from '../acciones.ts';

instalarExcelFalso();

// B3: en el banco no hay cinta; se expone lo que pulsaría, para probarlo.
(window as unknown as { __cinta: (accion: string) => Promise<void> }).__cinta = pedirAlPanel;

// Para poder inspeccionar desde fuera qué escribió el volcado: el banco no
// dibuja una cuadrícula, así que esta es la única forma de comprobarlo.
(globalThis as unknown as Record<string, unknown>).__hojaVolcada = hojaVolcada;
(globalThis as unknown as Record<string, unknown>).__hojasMatriz = hojasMatriz;
// V11: simular que el usuario editó una hoja (la vista previa del plazo lo escucha).
(globalThis as unknown as Record<string, unknown>).__cambiarHoja = avisarCambioHoja;

function Banco() {
  const [celda, setCelda] = useState(seleccion.ref);
  const [, repintar] = useState(0);

  // El banco no dibuja una cuadrícula, así que el resaltado se comprueba
  // leyéndolo: si aquí no aparece la celda con su color, no se ha pintado.
  useEffect(() => {
    const id = setInterval(() => repintar((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="banco">
        <strong>Banco de pruebas</strong> · Excel de mentira, no vale como verificación.
        <label>
          {' '}Celda seleccionada:{' '}
          <select
            value={celda}
            onChange={(e) => {
              seleccion.ref = e.target.value;
              avisarSeleccion();
              setCelda(e.target.value);
            }}
          >
            {CELDAS.map((c) => (
              <option key={c} value={c}>
                Modelo!{c}
              </option>
            ))}
          </select>
        </label>
        <span className="rellenos">
          {rellenos.size === 0
            ? ' · sin resaltado'
            : ` · resaltado: ${[...rellenos].map(([r, c]) => `${r}=${c}`).join(', ')}`}
        </span>
        {hojasMatriz.size > 0 && <span className="rellenos"> · hojas: {[...hojasMatriz.keys()].join(', ')}</span>}
      </div>
      <Panel />
    </>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <Banco />
  </StrictMode>,
);
