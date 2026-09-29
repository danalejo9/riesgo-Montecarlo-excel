/**
 * Arranque del panel.
 *
 * `Office.onReady` es obligatorio antes de tocar nada de Office.js, y hay que
 * esperarlo **antes** de montar React: si un componente llama a
 * `Office.context` mientras Office todavía no ha terminado de inicializarse,
 * falla con un error que no dice nada útil.
 *
 * Si el panel se abriera fuera de Office —el navegador, un test— `Office`
 * sencillamente no existe. En vez de quedarse en blanco, se avisa: durante el
 * desarrollo es fácil abrir `https://localhost:9090/taskpane.html` a mano y
 * perder un rato preguntándose por qué no funciona.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ErrorPanel } from './ErrorPanel.tsx';
import { Panel } from './Panel.tsx';
import { pedirAlPanel, registrarAcciones } from './acciones.ts';
import { aplicarModo } from '../excel/modoLibro.ts';
import { modoLibroEnMemoria } from '../excel/modoLibroCompartido.ts';
import './estilos.css';

const raiz = document.getElementById('raiz');

function montar(contenido: React.ReactNode): void {
  if (!raiz) throw new Error('Falta el elemento #raiz en taskpane.html');
  createRoot(raiz).render(<StrictMode>{contenido}</StrictMode>);
}

if (typeof Office === 'undefined') {
  montar(
    <main className="aviso">
      <h1>Fuera de Excel</h1>
      <p>
        Esta página es el panel de un complemento de Excel y necesita
        ejecutarse dentro de Excel para funcionar. Abierta directamente en el
        navegador no tiene con quién hablar.
      </p>
    </main>,
  );
} else {
  // B1: los botones de la cinta ejecutan código de esta página.
  registrarAcciones({
    // B2: el modo del libro, sin tocar el valor fijo elegido.
    modoFijo: () => aplicarModo({ ...modoLibroEnMemoria(), modo: 'fijo' }),
    modoAleatorio: () => aplicarModo({ ...modoLibroEnMemoria(), modo: 'aleatorio' }),
    // B3: actúan sin abrir el panel (lo hace el panel, montado aunque no se vea).
    marcarEntrada: () => pedirAlPanel('marcarEntrada'),
    marcarSalida: () => pedirAlPanel('marcarSalida'),
    simular: () => pedirAlPanel('simular'),
    quitarResaltado: () => pedirAlPanel('quitarResaltado'),
  });
  void Office.onReady(() => {
    montar(
      <ErrorPanel>
        <Panel />
      </ErrorPanel>,
    );
  });
}
