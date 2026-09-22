/**
 * El banco de pruebas: el panel de verdad, sobre un Excel de mentira.
 *
 * Sirve para desarrollar la interfaz sin Excel delante y para poder mirarla en
 * cualquier máquina. Lo que aquí funciona **no está verificado en Excel**: ver
 * el docstring de `excelFalso.ts`, que dice exactamente qué no puede cazar.
 */

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Panel } from '../Panel.tsx';
import '../estilos.css';
import { CELDAS, instalarExcelFalso, seleccion } from './excelFalso.ts';

instalarExcelFalso();

function Banco() {
  const [celda, setCelda] = useState(seleccion.ref);

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
