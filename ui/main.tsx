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
import { mostrar, pedirAlPanel, registrarAcciones } from './acciones.ts';
import { ITERACIONES_CINTA } from '../excel/cinta.ts';
import { PLANTILLAS } from '../excel/plantillas.ts';
import { escribirPlantilla } from '../excel/escribirPlantilla.ts';
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
    detenerSimulacion: () => pedirAlPanel('detener'),
    quitarResaltado: () => pedirAlPanel('quitarResaltado'),
    // U3.2: la cinta reorganizada.
    ...Object.fromEntries(ITERACIONES_CINTA.map((n) => [`iteraciones${n}`, () => pedirAlPanel(`iteraciones:${n}`)])),
    iteracionesOtra: () => mostrar('configuracion'),
    verDistribucion: () => pedirAlPanel('verDistribucion'),
    verListaModelo: () => pedirAlPanel('verListaModelo'),
    ajustarDatos: () => pedirAlPanel('ajustarDatos'),
    verEscenarios: () => pedirAlPanel('verEscenarios'),
    volcarHoja: () => pedirAlPanel('volcarHoja'),
    informePdf: () => pedirAlPanel('informePdf'),
    abrirAyuda: () => pedirAlPanel('abrirAyuda'),
    // Q1: el grupo Cronograma.
    crearCronograma: () => pedirAlPanel('cronograma:crear'),
    calidadCronograma: () => pedirAlPanel('cronograma:calidad'),
    simularCronograma: () => pedirAlPanel('cronograma:simular'),
    verGantt: () => pedirAlPanel('cronograma:gantt'),
    // Los ejemplos se escriben sin el panel: una hoja nueva, lista para simular.
    ...Object.fromEntries(PLANTILLAS.map((p) => [`ejemplo${p.id[0]?.toUpperCase()}${p.id.slice(1)}`, async () => {
      await escribirPlantilla(p);
    }])),
  });
  void Office.onReady(() => {
    montar(
      <ErrorPanel>
        <Panel />
      </ErrorPanel>,
    );
  });
}
