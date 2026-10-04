/**
 * Plantillas de partida (U1): cinco modelos pequeños que se escriben en una
 * hoja nueva, con las funciones RIESGO ya puestas (entradas, salidas con
 * `RIESGO.SALIDA`, un riesgo de evento y una correlación), listos para
 * simular. Sirven para aprender viendo un modelo que funciona y para empezar
 * el propio encima. Sin Office.js: la escritura está en `escribirPlantilla`.
 *
 * Las fórmulas van en la forma que acepta `Range.formulas` de Office.js
 * (nombres en inglés y coma como separador): Excel las enseña traducidas.
 */

export interface CeldaPlantilla {
  ref: string;
  /** Un texto, un número o una fórmula (empieza por «=»). */
  valor: string | number;
  formato?: string;
  negrita?: boolean;
}

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  /** Nombre de la hoja nueva (se numera si ya existe). */
  hoja: string;
  celdas: CeldaPlantilla[];
  /** Ancho de las columnas A y B, en caracteres aproximados. */
  anchos?: [number, number];
}

const EUROS = '#,##0 "€"';
const FECHA = 'dd/mm/yyyy';

/**
 * Las actividades del cronograma: duración (mínimo, más probable, máximo),
 * cuándo empieza (el fin de su predecesora; con dos, la que termine más tarde)
 * y, en palabras, de cuál depende.
 */
const ACTIVIDADES_CRONOGRAMA: readonly { nombre: string; dias: [number, number, number]; inicio: string; despues: string }[] = [
  { nombre: 'Diseño y estudios', dias: [20, 25, 35], inicio: '=B3', despues: '(inicio de la obra)' },
  { nombre: 'Licencia de construcción', dias: [30, 45, 90], inicio: '=D6', despues: 'Diseño y estudios' },
  { nombre: 'Adecuación del terreno', dias: [10, 14, 20], inicio: '=D6', despues: 'Diseño y estudios' },
  { nombre: 'Cimentación', dias: [20, 25, 40], inicio: '=MAX(D7,D8)', despues: 'Licencia y terreno (la última)' },
  { nombre: 'Estructura', dias: [40, 50, 70], inicio: '=D9', despues: 'Cimentación (+ lluvias, fila 16)' },
  { nombre: 'Instalaciones', dias: [25, 30, 45], inicio: '=D10', despues: 'Estructura' },
  { nombre: 'Mampostería y fachada', dias: [30, 35, 50], inicio: '=D10', despues: 'Estructura' },
  { nombre: 'Acabados', dias: [25, 30, 45], inicio: '=MAX(D11,D12)', despues: 'Instalaciones y fachada (la última)' },
  { nombre: 'Pruebas y entrega', dias: [5, 7, 12], inicio: '=D13', despues: 'Acabados' },
];
const PCT = '0.0%';

export const PLANTILLAS: readonly Plantilla[] = [
  {
    id: 'inversion',
    nombre: 'Proyecto de inversión',
    descripcion: 'Cinco años de flujos con ventas, crecimiento y margen inciertos; mide el VAN y la probabilidad de perder dinero.',
    hoja: 'Inversión',
    anchos: [34, 14],
    celdas: [
      { ref: 'A1', valor: 'Proyecto de inversión (plantilla)', negrita: true },
      { ref: 'A3', valor: 'Inversión inicial' }, { ref: 'B3', valor: 250000, formato: EUROS },
      { ref: 'A4', valor: 'Ventas del año 1' }, { ref: 'B4', valor: '=RIESGO.TRIANGULAR(180000,220000,280000)', formato: EUROS },
      { ref: 'A5', valor: 'Crecimiento anual de las ventas' }, { ref: 'B5', valor: '=RIESGO.NORMAL(0.05,0.03)', formato: PCT },
      { ref: 'A6', valor: 'Margen sobre ventas' }, { ref: 'B6', valor: '=RIESGO.PERT(0.22,0.3,0.36)', formato: PCT },
      { ref: 'A7', valor: 'Tasa de descuento' }, { ref: 'B7', valor: 0.09, formato: PCT },
      { ref: 'A9', valor: 'Año', negrita: true }, { ref: 'B9', valor: 'Flujo de caja', negrita: true },
      ...[1, 2, 3, 4, 5].flatMap((t) => [
        { ref: `A${9 + t}`, valor: `Año ${t}` },
        { ref: `B${9 + t}`, valor: `=B$4*(1+B$5)^${t - 1}*B$6`, formato: EUROS },
      ]),
      { ref: 'A16', valor: 'VAN', negrita: true },
      { ref: 'B16', valor: '=RIESGO.SALIDA("VAN")+NPV(B7,B10:B14)-B3', formato: EUROS, negrita: true },
      { ref: 'A18', valor: 'Simula y pon en Resultados el umbral «por debajo de 0»: la probabilidad de perder dinero.' },
    ],
  },
  {
    id: 'obra',
    nombre: 'Presupuesto de obra',
    descripcion: 'Partidas con estimación de mínimo, más probable y máximo, y dos riesgos que pueden ocurrir o no.',
    hoja: 'Obra',
    anchos: [34, 14],
    celdas: [
      { ref: 'A1', valor: 'Presupuesto de obra (plantilla)', negrita: true },
      { ref: 'A3', valor: 'Partida', negrita: true }, { ref: 'B3', valor: 'Coste', negrita: true },
      { ref: 'A4', valor: 'Cimentación' }, { ref: 'B4', valor: '=RIESGO.TRIANGULAR(40000,48000,65000)', formato: EUROS },
      { ref: 'A5', valor: 'Estructura' }, { ref: 'B5', valor: '=RIESGO.TRIANGULAR(110000,125000,160000)', formato: EUROS },
      { ref: 'A6', valor: 'Instalaciones' }, { ref: 'B6', valor: '=RIESGO.PERT(60000,70000,95000)', formato: EUROS },
      { ref: 'A7', valor: 'Acabados' }, { ref: 'B7', valor: '=RIESGO.TRIANGULAR(50000,55000,75000)', formato: EUROS },
      { ref: 'A9', valor: 'Riesgos', negrita: true },
      { ref: 'A10', valor: 'Retraso de licencias' }, { ref: 'B10', valor: '=RIESGO.EVENTO(0.25,RIESGO.TRIANGULAR(8000,15000,40000))', formato: EUROS },
      { ref: 'A11', valor: 'Subida del acero' }, { ref: 'B11', valor: '=RIESGO.EVENTO(0.15,20000)', formato: EUROS },
      { ref: 'A13', valor: 'Coste total', negrita: true },
      { ref: 'B13', valor: '=RIESGO.SALIDA("Coste total")+SUM(B4:B7)+SUM(B10:B11)', formato: EUROS, negrita: true },
      { ref: 'A15', valor: 'Tras simular, mira el «Registro de riesgos» y el p90 del coste total: un presupuesto con reserva.' },
    ],
  },
  {
    id: 'cartera',
    nombre: 'Cartera de inversiones',
    descripcion: 'Tres activos con rentabilidades inciertas, dos de ellos correlacionados; mide el valor al cabo de un año.',
    hoja: 'Cartera',
    anchos: [30, 14],
    celdas: [
      { ref: 'A1', valor: 'Cartera de inversiones (plantilla)', negrita: true },
      { ref: 'A3', valor: 'Capital' }, { ref: 'B3', valor: 100000, formato: EUROS },
      { ref: 'A5', valor: 'Activo', negrita: true }, { ref: 'B5', valor: 'Rentabilidad', negrita: true }, { ref: 'C5', valor: 'Peso', negrita: true },
      { ref: 'A6', valor: 'Acciones' }, { ref: 'B6', valor: '=RIESGO.NORMAL(0.07,0.18)', formato: PCT }, { ref: 'C6', valor: 0.5, formato: '0%' },
      { ref: 'A7', valor: 'Inmobiliario' }, { ref: 'B7', valor: '=RIESGO.NORMAL(0.05,0.1)', formato: PCT }, { ref: 'C7', valor: 0.3, formato: '0%' },
      { ref: 'A8', valor: 'Renta fija' }, { ref: 'B8', valor: '=RIESGO.NORMAL(0.025,0.03)', formato: PCT }, { ref: 'C8', valor: 0.2, formato: '0%' },
      { ref: 'A9', valor: 'Correlación acciones–inmobiliario' }, { ref: 'B9', valor: '=RIESGO.CORRELACION(B6,B7,0.6)', formato: '0.00' },
      { ref: 'A11', valor: 'Rentabilidad de la cartera', negrita: true },
      { ref: 'B11', valor: '=RIESGO.SALIDA("Rentabilidad de la cartera")+SUMPRODUCT(B6:B8,C6:C8)', formato: PCT, negrita: true },
      { ref: 'A12', valor: 'Valor al cabo de un año', negrita: true },
      { ref: 'B12', valor: '=RIESGO.SALIDA("Valor al cabo de un año")+B3*(1+B11)', formato: EUROS, negrita: true },
      { ref: 'A14', valor: 'Cambia la correlación de B9 a 0 y vuelve a simular: el p5 del valor mejora; así se ve lo que diversificar protege.' },
    ],
  },
  {
    id: 'serie',
    nombre: 'Serie de precios',
    descripcion: 'Un precio que evoluciona año a año con crecimiento incierto, y un tipo de interés que vuelve a su media; cada año, una salida para el abanico.',
    hoja: 'Serie',
    anchos: [30, 12],
    celdas: [
      { ref: 'A1', valor: 'Series temporales (plantilla)', negrita: true },
      { ref: 'A3', valor: 'Año', negrita: true },
      ...['B', 'C', 'D', 'E', 'F', 'G'].map((c, i) => ({ ref: `${c}3`, valor: i === 0 ? 'Hoy' : `Año ${i}`, negrita: true })),
      // Paseo aleatorio con deriva: cada año, el anterior por (1 + crecimiento incierto).
      { ref: 'A4', valor: 'Precio (crece un 3 % ± 8 %)' }, { ref: 'B4', valor: 100, formato: '#,##0.0' },
      ...['C', 'D', 'E', 'F', 'G'].map((c, i) => ({
        ref: `${c}4`,
        valor: `=RIESGO.SALIDA("Precio · Año ${i + 1}")+${String.fromCharCode(c.charCodeAt(0) - 1)}4*(1+RIESGO.NORMAL(0.03,0.08))`,
        formato: '#,##0.0',
      })),
      // Reversión a la media: se acerca un 40 % al 4 % cada año, con ruido.
      { ref: 'A5', valor: 'Tipo de interés (vuelve al 4 %)' }, { ref: 'B5', valor: 0.07, formato: '0.00%' },
      ...['C', 'D', 'E', 'F', 'G'].map((c) => {
        const prev = `${String.fromCharCode(c.charCodeAt(0) - 1)}5`;
        return { ref: `${c}5`, valor: `=${prev}+0.4*(0.04-${prev})+RIESGO.NORMAL(0,0.005)`, formato: '0.00%' };
      }),
      { ref: 'A6', valor: 'Tipo de interés dentro de 5 años' },
      { ref: 'B6', valor: '=RIESGO.SALIDA("Tipo a 5 años")+G5', formato: '0.00%' },
      { ref: 'A8', valor: 'Simula y abre «Comparar salidas»: el abanico del precio se abre con los años; el tipo converge hacia el 4 %.' },
    ],
  },
  {
    // El mismo cronograma de la demostración animada (artefacto «Cronograma de
    // obra incierto»): nueve actividades encadenadas y un riesgo de lluvias.
    id: 'cronograma',
    nombre: 'Cronograma de obra',
    descripcion: 'Nueve actividades encadenadas con duraciones inciertas y un riesgo de lluvias; mide la fecha de entrega y la probabilidad de cumplir el plazo.',
    hoja: 'Cronograma',
    anchos: [30, 14],
    celdas: [
      { ref: 'A1', valor: 'Cronograma de obra (plantilla)', negrita: true },
      { ref: 'A3', valor: 'Inicio de la obra' }, { ref: 'B3', valor: '=DATE(2027,2,1)', formato: FECHA },
      { ref: 'A5', valor: 'Actividad', negrita: true }, { ref: 'B5', valor: 'Duración (días)', negrita: true },
      { ref: 'C5', valor: 'Inicio', negrita: true }, { ref: 'D5', valor: 'Fin', negrita: true }, { ref: 'E5', valor: 'Empieza cuando termina', negrita: true },
      ...ACTIVIDADES_CRONOGRAMA.flatMap((a, i) => {
        const f = 6 + i;
        return [
          { ref: `A${f}`, valor: a.nombre },
          { ref: `B${f}`, valor: `=RIESGO.TRIANGULAR(${a.dias.join(',')})`, formato: '0' },
          { ref: `C${f}`, valor: a.inicio, formato: FECHA },
          { ref: `D${f}`, valor: `=C${f}+B${f}${a.nombre === 'Estructura' ? '+B16' : ''}`, formato: FECHA },
          { ref: `E${f}`, valor: a.despues },
        ];
      }),
      { ref: 'A16', valor: 'Retraso de la estructura por lluvias (días)' },
      { ref: 'B16', valor: '=RIESGO.EVENTO(0.35,RIESGO.TRIANGULAR(10,15,25))', formato: '0' },
      { ref: 'A18', valor: 'Fecha de entrega', negrita: true },
      { ref: 'B18', valor: '=RIESGO.SALIDA("Fecha de entrega")+D14', formato: FECHA, negrita: true },
      { ref: 'A19', valor: 'Duración total (días)', negrita: true },
      { ref: 'B19', valor: '=RIESGO.SALIDA("Duración total")+D14-B3', formato: '0', negrita: true },
      { ref: 'A21', valor: 'Con las duraciones más probables la obra termina el 06/09/2027 (217 días). Simula: casi nunca se cumple.' },
      { ref: 'A22', valor: 'En Resultados, pon el umbral de la fecha de entrega «por debajo de» 06/09/2027 y mira la Contingencia y el Registro de riesgos.' },
    ],
  },
];
