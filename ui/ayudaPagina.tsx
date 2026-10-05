/**
 * La ayuda (U3.2), en una ventana flotante: cómo empezar, qué hace cada
 * grupo de la cinta y qué significa cada número y gráfico. Los textos de los
 * números son los mismos de la ayuda contextual del panel (`ayuda.tsx`), para
 * que no se contradigan. Es el primer paso del manual (M).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AYUDA, type TemaAyuda } from './ayuda.tsx';
import './estilos.css';
import './explorador.css';

const TITULOS: Record<TemaAyuda, string> = {
  cifras: 'Media, p5, p95 y desviación',
  tornado: 'Qué la mueve más (tornado)',
  percentiles: 'Percentiles y precisión',
  acumulada: 'Probabilidad acumulada',
  riesgo: 'Medidas de riesgo (VaR, CVaR)',
  colas: 'Qué tiene que pasar',
  dispersion: 'Dispersión con una entrada',
  estres: 'Estrés: una entrada en un extremo',
  decisiones: 'Comparar decisiones',
  registro: 'Registro de riesgos',
  correlaciones: 'Correlaciones',
  contingencia: 'Contingencia y valor base',
  matriz: 'Matriz de probabilidad e impacto',
  finCronograma: 'Cronograma: fin del proyecto',
  eliminacion: 'Cronograma: tornado por eliminación de riesgos',
  criticidad: 'Cronograma: criticidad y SSI',
  calidadCronograma: 'Cronograma: chequeo de calidad',
  comparar: 'Comparar salidas',
};

const GRUPOS_CINTA: [string, string][] = [
  ['Panel', 'Abre el panel en Modelo, Resultados o Configuración.'],
  ['Celdas', 'Marca la celda seleccionada como entrada (amarillo) o salida (verde), sin abrir el panel. Quitar resaltado devuelve los colores de antes.'],
  ['Simulación', 'Iteraciones elige cuántas (la actual aparece desactivada; «Otra cantidad…» abre Configuración). Simular corre el modelo.'],
  ['Modo del libro', 'Qué enseñan las celdas con funciones RIESGO fuera de la simulación: un valor fijo (la media) o uno al azar que cambia con F9.'],
  ['Análisis', 'Ver distribución abre una ventana con la distribución de la celda seleccionada y la sigue al seleccionar otra. Entradas y salidas abre la misma ventana con la lista del modelo: pulsa una fila para ir a esa celda. Ajustar a datos propone distribuciones para una columna de datos seleccionada. Escenarios guarda y compara simulaciones.'],
  ['Cronograma', 'Crear libro de cronograma añade las hojas Config, Calendario (con los festivos de Colombia), Actividades, Relaciones, Incertidumbre, Riesgos e Impactos con un ejemplo de obra. Revisar calidad revisa la lógica antes de simular. Simular cronograma recalcula la ruta crítica en cada iteración y escribe la hoja Resultados_Cronograma.'],
  ['Informes', 'Volcar a una hoja escribe los resultados con sus gráficos; Informe PDF los abre listos para imprimir.'],
  ['Ayuda', 'Esta ventana, los modelos de ejemplo (se escriben en una hoja nueva) y el diagnóstico del complemento.'],
];

function Ayuda() {
  return (
    <main className="explorador ayuda-pagina">
      <header><h1>Ayuda</h1></header>
      <section>
        <h2>Cómo empezar</h2>
        <ol>
          <li>Selecciona una celda cuyo valor no conoces y pulsa <strong>Marcar entrada</strong>; en el panel elige su distribución.</li>
          <li>Selecciona el resultado que te importa y pulsa <strong>Marcar salida</strong>.</li>
          <li>Pulsa <strong>Simular</strong>. En Resultados verás la media, el rango probable y qué entrada pesa más.</li>
          <li>Si ya usas funciones como <code>=RIESGO.NORMAL(100;15)</code> en tus fórmulas, basta con marcar la salida.</li>
        </ol>
      </section>
      <section>
        <h2>La cinta</h2>
        <table className="tabla-estadisticas"><tbody>
          {GRUPOS_CINTA.map(([g, t]) => <tr key={g}><th scope="row">{g}</th><td className="texto">{t}</td></tr>)}
        </tbody></table>
      </section>
      <section>
        <h2>Qué significa cada cosa</h2>
        {(Object.keys(AYUDA) as TemaAyuda[]).map((k) => (
          <div key={k}>
            <h3>{TITULOS[k]}</h3>
            <p>{AYUDA[k]}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Ayuda /></StrictMode>);
