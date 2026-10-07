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
  contingencia:
    'El valor base es lo que da la hoja sin incertidumbre: la estimación de siempre. En un coste o un plazo, la probabilidad de no pasarse de él y la reserva (P80 menos el valor base) que haría falta para tener un 80 % de confianza; en un beneficio, la probabilidad de alcanzarlo y lo que se obtiene con esa confianza (el P20). Elige arriba si la salida es un coste o un beneficio.',
  matriz:
    'Cada riesgo del registro en su casilla: la probabilidad en horizontal y el impacto medio en vertical, comparado con el mayor del registro. El color es la severidad (probabilidad × impacto): baja, media, alta o crítica. Los de arriba a la derecha son los primeros que hay que mitigar.',
  gantt:
    'El Gantt se calcula con el mismo motor del análisis (CPM con las cuatro relaciones, desfases, calendarios y festivos). La ruta crítica, por defecto, son las actividades con holgura total ≤ 0; en la ventana se puede cambiar a «ruta más larga», que sigue hacia atrás desde el fin solo los vínculos impulsores (los de holgura 0) y es la correcta cuando hay restricciones o varios calendarios. Lo que se edita en la ventana se escribe en las hojas Actividades y Relaciones: las hojas siguen siendo la verdad. Tras simular, debajo de las barras salen las fechas de fin posibles, una barra por semana en el mismo eje: azules las que cumplen la meta, naranjas las que no.',
  finCronograma:
    'La fecha determinística es la del cronograma con las duraciones base y sin riesgos: la que se presentaría sin análisis. En cada iteración se recalcula la red entera, así que donde dos ramas se juntan manda la más larga de esa iteración (sesgo de convergencia): por eso casi nunca se cumple. El P80 es la fecha que se cumple 8 de cada 10 veces.',
  eliminacion:
    'Para cada riesgo, se vuelve a simular sin él con los mismos números aleatorios, y se mide cuánto baja el P80 del fin. Es más fiable que una correlación: un riesgo que cae en una ruta con holgura sale con 0 aunque ocurra a menudo, porque no mueve la entrega.',
  criticidad:
    'Criticidad: en qué porcentaje de iteraciones la actividad quedó en la ruta crítica (holgura total ≤ 0). SSI: la criticidad por lo que varía la actividad frente a lo que varía el proyecto; ordena por cuánto pesa de verdad. Ojo: entre calendarios distintos (lunes a viernes y lunes a sábado) un sábado puede dar un día de holgura y bajar la criticidad de lo que va antes.',
  calidadCronograma:
    'Revisión del cronograma antes de simular, inspirada en los 14 puntos de la DCMA. Rojo en «Red calculable» impide simular (un ciclo, una predecesora que no existe). Lo demás avisa: una actividad sin sucesora no empuja el fin aunque se retrase, una restricción dura no deja que el retraso se propague, y una tarea sin incertidumbre hace los resultados optimistas.',
  costoCronograma:
    'El costo se calcula en cada iteración con las duraciones y fechas de esa iteración: lo que se paga por día (administración, interventoría, alquileres) crece con los retrasos, y lo que escala con el tiempo cuesta más si se ejecuta más tarde. El costo base usa los valores y duraciones base, sin riesgos; la contingencia es el P80 menos ese costo base: la reserva que da un 80 % de confianza.',
  jcl:
    'La confianza conjunta (JCL): la proporción de iteraciones que cumplen a la vez la fecha meta y el costo meta. Siempre es menor que cada probabilidad por separado, porque un proyecto que se atrasa suele costar más. Es el número que pide la práctica de riesgo integrado (AACE 57R-09).',
  prePost:
    'Se simulan los dos escenarios con los mismos números aleatorios: antes de mitigar (probabilidades e impactos actuales) y después (probabilidad post, la parte del impacto que queda, más lo que cuesta mitigar). La diferencia es solo la de la mitigación. Si el costo post sale mayor, la mitigación cuesta más de lo que ahorra en costo, aunque gane tiempo.',
  reserva:
    'Cuánto tiempo y cuánto dinero hay que reservar sobre el plan (el cronograma y el costo sin incertidumbre ni riesgos) para llegar al nivel de confianza elegido, y de dónde sale. «Incertidumbre» es lo que haría falta aunque no ocurriera ningún riesgo (la corrida sin riesgos). El resto se reparte entre los riesgos según lo que mide quitar cada uno y volver a simular con los mismos números: las oportunidades restan, y las partes suman exactamente la reserva.',
  hitosContrato:
    'Los hitos que fija el contrato (hoja Hitos_Contrato), con su fecha y su multa por día natural de retraso. En cada iteración, si el hito termina tarde, la multa (con su tope) se suma al costo de esa iteración: entra en la contingencia y en la probabilidad conjunta. La fecha contractual no mueve el cronograma: es contra lo que se mide.',
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
