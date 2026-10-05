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
import { avisarSeleccion, CELDAS, hojasMemoria, hojaVolcada, instalarExcelFalso, rellenos, seleccion } from './excelFalso.ts';
import { pedirAlPanel } from '../acciones.ts';
import { hojasSinteticas } from '../../excel/cronogramaSintetico.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

instalarExcelFalso();

// B3: en el banco no hay cinta; se expone lo que pulsaría, para probarlo.
(window as unknown as { __cinta: (accion: string) => Promise<void> }).__cinta = pedirAlPanel;

// Para poder inspeccionar desde fuera qué escribió el volcado: el banco no
// dibuja una cuadrícula, así que esta es la única forma de comprobarlo.
(globalThis as unknown as Record<string, unknown>).__hojaVolcada = hojaVolcada;
(globalThis as unknown as Record<string, unknown>).__hojasMemoria = hojasMemoria;
// G1: un cronograma sintético grande en las hojas de memoria, para medir el Gantt.
(globalThis as unknown as Record<string, unknown>).__cronogramaSintetico = (n = 2000) => {
  for (const [nombre, m] of Object.entries(hojasSinteticas(serieDeFecha(2027, 1, 4), n))) hojasMemoria.set(nombre, m.map((f) => [...f]));
};

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
