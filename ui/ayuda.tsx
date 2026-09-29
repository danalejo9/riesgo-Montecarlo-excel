/**
 * Ayuda contextual (E4): «¿Qué es esto?» junto a cada número y gráfico, sin
 * salir del panel. Plegada: quien ya lo sabe no tiene que leerla. Los textos,
 * aquí juntos, para que el manual (M2) los reutilice y no se contradigan.
 */
import { useState } from 'react';

export const AYUDA = {
  cifras:
    'La media es el valor medio de todas las iteraciones. El p5 y el p95 acotan el 90 % central: solo 1 de cada 20 iteraciones queda por debajo del p5, y otra por encima del p95. La desviación mide cuánto se separan los valores de la media: cuanto más grande, más incierto.',
  tornado:
    'Qué entradas explican más la variación de la salida. En «Correlación», la barra es la correlación de rangos (de −1 a 1) y el % es la parte de la varianza que explica cada entrada. En «Cambio en la salida», cuánto se mueve la media de la salida entre el 10 % más bajo y el más alto de cada entrada, en sus unidades.',
  percentiles:
    'El percentil p es el valor que deja por debajo el p % de las iteraciones: el p50 es la mediana. La precisión dice cuánto podría cambiar la media si se repitiera la simulación con otra semilla.',
  acumulada:
    'Para cada valor, la probabilidad de quedar por debajo. Se lee al revés que el histograma: elige un valor en horizontal y la curva te da su probabilidad; o una probabilidad en vertical y te da el valor.',
  riesgo:
    'VaR 5 %: el valor que solo el 5 % de las iteraciones empeora. CVaR 5 %: la media de ese 5 % peor, cuánto se pierde de media cuando va mal. La asimetría dice hacia qué lado tiene la cola más larga; la curtosis, si los extremos son más frecuentes que en una normal.',
  colas:
    'Cómo están las entradas en las iteraciones en que la salida cae en su 10 % más bajo (o más alto), frente a lo normal. Dice qué tiene que pasar para que salga mal, que el tornado no dice.',
  dispersion:
    'Cada punto es una iteración: la entrada en horizontal y la salida en vertical. Una nube inclinada y estrecha es una relación fuerte; una nube redonda, que la entrada apenas importa; una forma curva o con escalón, una relación que el tornado resume mal.',
  estres:
    'La salida cuando una entrada se queda en un extremo de su rango, frente a la de siempre. Se calcula con las iteraciones en que la entrada cayó ahí, sin volver a simular: el resto de entradas siguen variando como siempre.',
  decisiones:
    'Cada opción de RIESGO.DECISION se simula entera, con los mismos números aleatorios, así que las diferencias son de la decisión y no del azar. Compara la media, pero mira también los percentiles: una opción puede tener mejor media y un peor p5.',
  registro:
    'Cada RIESGO.EVENTO con su probabilidad, su impacto y su valor esperado (probabilidad × impacto medio): lo que aporta de media al total, ocurra o no. Sirve para priorizar qué riesgos mitigar primero.',
  correlaciones:
    'Una correlación dice que dos entradas se mueven juntas (positiva) o al revés (negativa). Olvidarla suele subestimar el riesgo: los malos escenarios de una variable ya no se compensan con los buenos de la otra.',
  comparar:
    'Caja y bigotes, curvas acumuladas y abanico de todas las salidas numéricas en un mismo eje. Tiene sentido cuando están en las mismas unidades, como el flujo de caja de cada año.',
} as const;

export type TemaAyuda = keyof typeof AYUDA;

/** «¿Qué es esto?», plegado; al pulsarlo, la explicación. */
export function Ayuda({ tema }: { tema: TemaAyuda }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="ayuda">
      <button type="button" className="enlace-ayuda" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        {abierta ? 'Ocultar la ayuda' : '¿Qué es esto?'}
      </button>
      {abierta && <p className="texto-ayuda">{AYUDA[tema]}</p>}
    </div>
  );
}
