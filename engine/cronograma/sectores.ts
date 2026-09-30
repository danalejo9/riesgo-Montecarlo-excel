/**
 * W6: ejemplos completos por sector para empezar sin hoja en blanco:
 * vivienda, vía, edificio público por licitación y software. Cada uno trae
 * las actividades con su lógica, su incertidumbre (mínimo, más probable y
 * máximo) y sus costos; los riesgos típicos del sector con su respuesta
 * (antes y después); el calendario de trabajo del sector y un hito
 * contractual con su multa. Listos para calcular y simular; la idea es
 * cambiarlos por el proyecto propio, no usarlos tal cual.
 *
 * Los números son **plausibles, no normativos**: sirven para ver cómo se
 * comporta un proyecto de ese tipo y como punto de partida. Los costos van
 * en la moneda del libro. Sin Office.js: la escritura está en
 * `excel/cronograma.ts`.
 */

import { calcularCPM } from './cpm.ts';
import { HOJA_HITOS } from './hitos.ts';
import { ENCABEZADO_ACTIVIDADES, FORMATO_FECHA, plantillaActividades, type HojaAEscribir } from './hojas.ts';
import { HOJA_CALENDARIO, leerCronograma } from './lectorTabla.ts';
import { HOJA_RIESGOS } from './riesgos.ts';

export type IdSector = 'vivienda' | 'via' | 'edificio' | 'software';

/** [ID, actividad, duración, predecesoras, mínimo, máximo, categoría, costo por día, costo fijo] */
type FilaEjemplo = [string, string, number, string, number | '', number | '', string, number | '', number | ''];

/**
 * [ID, riesgo, probabilidad, impacto mín, más probable, máx, actividades, costo si ocurre, respuesta,
 * responsable, costo de la respuesta, probabilidad después, impacto mín, más probable y máx después, categoría]
 */
type RiesgoEjemplo = [string, string, number, number, number, number, string, number | '', string, string, number | '', number | '', number | '', number | '', number | '', string];

export interface EjemploSector {
  id: IdSector;
  nombre: string;
  descripcion: string;
  titulo: string;
  /** Lunes a domingo. */
  laborables: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  costoIndirectoDia: number;
  actividades: FilaEjemplo[];
  riesgos: RiesgoEjemplo[];
  /** El hito contractual: su ID, días naturales de margen sobre el fin del plan, multa diaria y tope. */
  hito: { id: string; margen: number; multaDia: number; tope: number; nota: string };
}

const LUNES_A_SABADO: EjemploSector['laborables'] = [true, true, true, true, true, true, false];
const LUNES_A_VIERNES: EjemploSector['laborables'] = [true, true, true, true, true, false, false];

const TIERRAS = 'Movimiento de tierras y cimentación';
const OBRA = 'Obra gris y estructura';

export const EJEMPLOS_SECTOR: readonly EjemploSector[] = [
  {
    id: 'vivienda',
    nombre: 'Vivienda',
    descripcion: 'Casa de dos pisos: licencia, cimentación, estructura, instalaciones y acabados, con lluvias, licencia y materiales como riesgos.',
    titulo: 'Ejemplo — Vivienda unifamiliar de dos pisos (cámbialo por tu proyecto)',
    laborables: LUNES_A_SABADO,
    costoIndirectoDia: 350,
    actividades: [
      ['1', 'Firma del contrato', 0, '', '', '', 'Hitos', '', ''],
      ['2', 'Licencia de construcción', 30, '1', 25, 70, 'Trámites y permisos', 50, 1500],
      ['3', 'Diseños estructurales y de instalaciones', 20, '1', 16, 30, 'Diseño y estudios', 300, ''],
      ['4', 'Compra de materiales principales', 10, '3', 8, 20, 'Suministros e importaciones', 100, ''],
      ['5', 'Preliminares y replanteo', 5, '2;4', 4, 8, OBRA, 600, ''],
      ['6', 'Excavación y cimentación', 18, '5', 14, 30, TIERRAS, 1400, ''],
      ['7', 'Estructura en concreto', 40, '6', 34, 58, OBRA, 1800, ''],
      ['8', 'Mampostería', 25, '7', 21, 35, OBRA, 1100, ''],
      ['9', 'Cubierta', 12, '7', 10, 18, OBRA, 1200, ''],
      ['10', 'Instalaciones hidrosanitarias', 20, '8CC+10', 16, 28, 'Instalaciones', 900, ''],
      ['11', 'Instalaciones eléctricas', 20, '8CC+10', 16, 28, 'Instalaciones', 850, ''],
      ['12', 'Pañetes y enchapes', 25, '9;10;11', 21, 35, 'Acabados', 1000, ''],
      ['13', 'Carpintería y ventanería', 15, '12CC+10', 12, 25, 'Acabados', 900, ''],
      ['14', 'Pintura', 12, '12;13', 10, 16, 'Acabados', 700, ''],
      ['15', 'Obras exteriores y cerramiento', 15, '9', 12, 22, OBRA, 800, ''],
      ['16', 'Conexión de servicios públicos y pruebas', 8, '14;15', 6, 20, 'Pruebas y puesta en marcha', 400, ''],
      ['17', 'Entrega de la vivienda', 0, '16', '', '', 'Hitos', '', ''],
    ],
    riesgos: [
      ['R1', 'Lluvias durante la cimentación y la estructura', 0.45, 0.05, 0.1, 0.25, `${TIERRAS};${OBRA}`, 3000,
        'Cimentar en temporada seca y tener carpas y bombeo', 'Residente de obra', 2000, 0.45, 0.03, 0.06, 0.15, 'Clima'],
      ['R2', 'Demora en la licencia de construcción', 0.35, 0.15, 0.3, 0.8, '2', 1500,
        'Radicar con un gestor de trámites y la documentación completa', 'Director del proyecto', 1200, 0.15, 0.1, 0.2, 0.4, 'Externo'],
      ['R3', 'Escasez de mano de obra calificada', 0.25, 0.05, 0.1, 0.2, 'Instalaciones;Acabados', '',
        'Contratar las cuadrillas con anticipación', 'Director de obra', 1000, 0.1, 0.05, 0.1, 0.2, 'Recursos'],
      ['R4', 'Retraso en la entrega de materiales', 0.3, 0.1, 0.25, 0.6, '4', 2000,
        'Compra anticipada y un proveedor alterno', 'Compras', 500, 0.15, 0.05, 0.15, 0.3, 'Suministros'],
      ['R5', 'Suelo distinto al del estudio', 0.15, 0.2, 0.4, 1, '6', 12000, '', '', '', '', '', '', '', 'Técnico'],
      ['R6', 'Oportunidad: formaleta metálica reutilizable en la estructura', 0.3, -0.15, -0.1, -0.05, '7', '', '', '', '', '', '', '', '', 'Técnico'],
    ],
    hito: { id: '17', margen: 35, multaDia: 150, tope: 15_000, nota: 'Entrega pactada en el contrato de obra' },
  },
  {
    id: 'via',
    nombre: 'Vía',
    descripcion: 'Pavimentación de 5 km: estudios, permisos ambientales, predios, movimiento de tierras, drenaje y asfalto, con lluvias, predios y comunidad como riesgos.',
    titulo: 'Ejemplo — Pavimentación de una vía de 5 km (cámbialo por tu proyecto)',
    laborables: LUNES_A_SABADO,
    costoIndirectoDia: 900,
    actividades: [
      ['1', 'Acta de inicio', 0, '', '', '', 'Hitos', '', ''],
      ['2', 'Estudios y diseños (topografía, suelos y pavimento)', 30, '1', 25, 45, 'Diseño y estudios', 700, ''],
      ['3', 'Permisos ambientales y de ocupación de cauces', 40, '1', 30, 90, 'Trámites y permisos', 100, ''],
      ['4', 'Gestión predial', 40, '2', 30, 100, 'Trámites y permisos', 300, 60_000],
      ['5', 'Movilización y campamento', 8, '2', 6, 12, OBRA, 1500, ''],
      ['6', 'Desmonte y limpieza', 10, '3;5', 8, 15, TIERRAS, 2000, ''],
      ['7', 'Movimiento de tierras (cortes y terraplenes)', 40, '4;6', 32, 60, TIERRAS, 5500, ''],
      ['8', 'Obras de drenaje (alcantarillas y cunetas)', 30, '7CC+10', 24, 42, OBRA, 3000, ''],
      ['9', 'Subbase y base granular', 30, '7', 25, 42, 'Pavimentos', 4500, ''],
      ['10', 'Carpeta asfáltica', 20, '8;9', 16, 30, 'Pavimentos', 7000, ''],
      ['11', 'Obras complementarias (muros y andenes)', 25, '8', 20, 35, OBRA, 2500, ''],
      ['12', 'Señalización y demarcación', 8, '10', 6, 12, 'Acabados', 1200, ''],
      ['13', 'Ensayos de calidad y recibo de obra', 7, '11;12', 5, 15, 'Pruebas y puesta en marcha', 600, ''],
      ['14', 'Entrega de la vía', 0, '13', '', '', 'Hitos', '', ''],
    ],
    riesgos: [
      ['R1', 'Temporada de lluvias', 0.55, 0.1, 0.2, 0.4, `${TIERRAS};Pavimentos`, 25_000,
        'Drenaje provisional y frentes de trabajo alternos', 'Residente de obra', 15_000, 0.55, 0.05, 0.12, 0.25, 'Clima'],
      ['R2', 'Retraso en la compra de predios', 0.4, 0.2, 0.4, 1, '4', 10_000,
        'Negociación temprana y expropiación administrativa de respaldo', 'Gestor predial', 8000, 0.25, 0.1, 0.25, 0.6, 'Predial'],
      ['R3', 'Demora del permiso ambiental', 0.3, 0.2, 0.4, 0.9, '3', 5000,
        'Radicar pronto, con el estudio completo', 'Especialista ambiental', 4000, 0.15, 0.1, 0.2, 0.5, 'Externo'],
      ['R4', 'Bloqueos o paros de la comunidad', 0.25, 0.03, 0.08, 0.2, `${TIERRAS};${OBRA};Pavimentos`, 15_000,
        'Socializar el proyecto y contratar mano de obra local', 'Trabajador social', 6000, 0.1, 0.02, 0.05, 0.1, 'Social'],
      ['R5', 'Redes de servicios públicos no registradas', 0.2, 0.1, 0.2, 0.5, '7;8', 12_000, '', '', '', '', '', '', '', 'Técnico'],
      ['R6', 'Escasez de asfalto o falla de la planta', 0.2, 0.1, 0.25, 0.6, '10', 8000, '', '', '', '', '', '', '', 'Suministros'],
      ['R7', 'Oportunidad: fuente de material cercana a la obra', 0.3, -0.12, -0.08, -0.03, '7;9', '', '', '', '', '', '', '', '', 'Técnico'],
    ],
    hito: { id: '14', margen: 45, multaDia: 1000, tope: 80_000, nota: 'Plazo del contrato de obra' },
  },
  {
    id: 'edificio',
    nombre: 'Edificio público',
    descripcion: 'Colegio por licitación: pliegos, adjudicación, diseños, licencia, obra, equipos importados y recibo, con licitación desierta, diseños y pagos como riesgos.',
    titulo: 'Ejemplo — Edificio público (colegio) contratado por licitación (cámbialo por tu proyecto)',
    laborables: LUNES_A_VIERNES,
    costoIndirectoDia: 1200,
    actividades: [
      ['1', 'Estudios previos y pliegos', 20, '', 15, 30, 'Diseño y estudios', 400, ''],
      ['2', 'Licitación y adjudicación', 40, '1', 35, 80, 'Trámites y permisos', 150, ''],
      ['3', 'Acta de inicio', 0, '2', '', '', 'Hitos', '', ''],
      ['4', 'Revisión y ajuste de diseños', 20, '3', 15, 35, 'Diseño y estudios', 900, ''],
      ['5', 'Licencia de construcción', 30, '4', 25, 60, 'Trámites y permisos', 100, 4000],
      ['6', 'Preliminares y cerramiento', 8, '5', 6, 12, OBRA, 1500, ''],
      ['7', 'Cimentación', 25, '6', 20, 38, TIERRAS, 3500, ''],
      ['8', 'Estructura', 44, '7', 38, 62, OBRA, 4500, ''],
      ['9', 'Mampostería y cubierta', 35, '8CC+20', 30, 48, OBRA, 3000, ''],
      ['10', 'Instalaciones eléctricas, hidráulicas y de redes', 40, '9CC+15', 34, 55, 'Instalaciones', 2800, ''],
      ['11', 'Fabricación e importación de equipos (ascensor y planta eléctrica)', 40, '4', 35, 90, 'Suministros e importaciones', '', 180_000],
      ['12', 'Montaje de equipos', 15, '9;11', 12, 25, 'Instalaciones', 1500, ''],
      ['13', 'Acabados', 40, '10', 34, 55, 'Acabados', 2500, ''],
      ['14', 'Pruebas y puesta en marcha', 12, '12;13', 10, 25, 'Pruebas y puesta en marcha', 1000, ''],
      ['15', 'Recibo a satisfacción y liquidación', 10, '14', 8, 30, 'Trámites y permisos', 300, ''],
      ['16', 'Entrega del edificio', 0, '15', '', '', 'Hitos', '', ''],
    ],
    riesgos: [
      ['R1', 'Licitación declarada desierta', 0.15, 0.4, 0.6, 1, '2', 3000,
        'Estudio de mercado y pliegos claros', 'Entidad contratante', 2000, 0.07, 0.4, 0.6, 1, 'Contractual'],
      ['R2', 'Ajustes de diseño pedidos por la interventoría', 0.4, 0.1, 0.25, 0.6, '4;8', 15_000,
        'Revisión conjunta de los diseños antes del acta de inicio', 'Director del proyecto', 5000, 0.2, 0.05, 0.15, 0.3, 'Técnico'],
      ['R3', 'Retraso en la importación de equipos', 0.35, 0.15, 0.3, 0.8, '11', 10_000,
        'Pedido anticipado con garantía de cumplimiento', 'Compras', 3000, 0.2, 0.1, 0.2, 0.4, 'Suministros'],
      ['R4', 'Lluvias durante la cimentación y la estructura', 0.4, 0.05, 0.1, 0.2, `${TIERRAS};${OBRA}`, 8000, '', '', '', '', '', '', '', 'Clima'],
      ['R5', 'Pagos atrasados de la entidad', 0.25, 0.05, 0.1, 0.3, `${OBRA};Instalaciones;Acabados`, '',
        'Programar el flujo de caja con el anticipo', 'Director financiero', '', 0.15, 0.05, 0.1, 0.3, 'Financiero'],
      ['R6', 'Cambios de alcance pedidos por la entidad', 0.3, 0.05, 0.15, 0.4, 'Acabados', 25_000,
        'Control de cambios formal con la interventoría', 'Interventoría', 1000, 0.3, 0.03, 0.08, 0.2, 'Alcance'],
      ['R7', 'Oportunidad: anticipo a tiempo para comprar el acero por adelantado', 0.35, -0.12, -0.06, -0.02, '8', '', '', '', '', '', '', '', '', 'Financiero'],
    ],
    hito: { id: '16', margen: 45, multaDia: 2000, tope: 150_000, nota: 'Plazo de ejecución del contrato' },
  },
  {
    id: 'software',
    nombre: 'Software',
    descripcion: 'Implantación de un sistema: requisitos, diseño, desarrollo, integraciones, migración, pruebas y salida en vivo, con cambios de requisitos e integraciones como riesgos.',
    titulo: 'Ejemplo — Implantación de un sistema de gestión (cámbialo por tu proyecto)',
    laborables: LUNES_A_VIERNES,
    costoIndirectoDia: 600,
    actividades: [
      ['1', 'Inicio del proyecto', 0, '', '', '', 'Hitos', '', ''],
      ['2', 'Levantamiento de requisitos', 15, '1', 12, 25, 'Diseño y estudios', 1600, ''],
      ['3', 'Diseño de la arquitectura', 10, '2', 8, 15, 'Diseño y estudios', 1400, ''],
      ['4', 'Diseño de la experiencia de usuario', 12, '2', 10, 20, 'Diseño y estudios', 1000, ''],
      ['5', 'Infraestructura en la nube', 8, '3', 6, 15, 'Infraestructura', 800, 5000],
      ['6', 'Desarrollo del núcleo', 30, '3;5', 25, 50, 'Desarrollo de software', 3200, ''],
      ['7', 'Desarrollo del portal de clientes', 25, '4;6CC+10', 20, 42, 'Desarrollo de software', 2400, ''],
      ['8', 'Integraciones con los sistemas existentes', 20, '6', 15, 40, 'Desarrollo de software', 2000, ''],
      ['9', 'Migración de datos', 15, '6', 12, 30, 'Desarrollo de software', 1200, ''],
      ['10', 'Pruebas del sistema', 12, '7;8', 10, 20, 'Pruebas y puesta en marcha', 1800, ''],
      ['11', 'Pruebas de aceptación con usuarios', 10, '9;10', 8, 20, 'Pruebas y puesta en marcha', 1500, ''],
      ['12', 'Capacitación', 5, '11', 4, 8, 'Gestión del cambio', 900, ''],
      ['13', 'Salida en vivo', 0, '12', '', '', 'Hitos', '', ''],
      ['14', 'Estabilización', 10, '13', 8, 20, 'Pruebas y puesta en marcha', 1500, ''],
      ['15', 'Cierre del proyecto', 0, '14', '', '', 'Hitos', '', ''],
    ],
    riesgos: [
      ['R1', 'Cambios en los requisitos', 0.5, 0.1, 0.2, 0.5, 'Desarrollo de software', 20_000,
        'Alcance congelado por fases y control de cambios', 'Dueño del producto', 3000, 0.3, 0.05, 0.12, 0.3, 'Alcance'],
      ['R2', 'Interfaces mal documentadas de los sistemas existentes', 0.4, 0.2, 0.4, 1, '8', 8000,
        'Prueba de concepto de cada integración al principio', 'Arquitecto', 4000, 0.2, 0.1, 0.2, 0.5, 'Técnico'],
      ['R3', 'Datos de origen de mala calidad', 0.35, 0.2, 0.4, 0.8, '9', 5000,
        'Perfilar y limpiar los datos desde el inicio', 'Líder de datos', 3000, 0.2, 0.1, 0.2, 0.4, 'Técnico'],
      ['R4', 'Rotación de personas clave del equipo', 0.2, 0.1, 0.2, 0.4, 'Desarrollo de software', 12_000,
        'Documentación y trabajo en parejas por módulo', 'Gerente del proyecto', 2000, 0.2, 0.05, 0.1, 0.2, 'Recursos'],
      ['R5', 'Poca disponibilidad de los usuarios para requisitos y pruebas', 0.35, 0.2, 0.4, 0.8, '2;11', '',
        'Agenda acordada con los directivos desde el inicio', 'Patrocinador', '', 0.15, 0.1, 0.2, 0.4, 'Organizacional'],
      ['R6', 'Oportunidad: reutilizar componentes de otro proyecto', 0.3, -0.2, -0.1, -0.05, '6;7', '', '', '', '', '', '', '', '', 'Técnico'],
    ],
    hito: { id: '13', margen: 30, multaDia: 500, tope: 30_000, nota: 'Fecha de salida en vivo del contrato' },
  },
];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const ENCABEZADO_RIESGOS = [
  'ID', 'Riesgo', 'Probabilidad', 'Impacto mínimo', 'Impacto más probable', 'Impacto máximo', 'Actividades afectadas', 'Costo si ocurre',
  'Respuesta', 'Responsable', 'Costo de la respuesta', 'Probabilidad después', 'Impacto mínimo después', 'Impacto más probable después',
  'Impacto máximo después', 'Categoría del riesgo', 'Estado',
];

export interface HojasEjemplo {
  actividades: HojaAEscribir;
  calendario: HojaAEscribir;
  riesgos: HojaAEscribir;
  hitos: HojaAEscribir;
}

/** Las hojas de un ejemplo, con el proyecto empezando en `inicio` (número de serie). */
export function hojasDeEjemplo(id: IdSector, inicio: number, codigoMoneda?: string): HojasEjemplo {
  const e = EJEMPLOS_SECTOR.find((x) => x.id === id);
  if (!e) throw new Error(`No hay ejemplo «${id}»`);
  const base = plantillaActividades(codigoMoneda);
  const vacias = ENCABEZADO_ACTIVIDADES.length - 10;
  const actividades: HojaAEscribir = {
    ...base,
    valores: [
      [e.titulo],
      [''],
      ENCABEZADO_ACTIVIDADES,
      ...e.actividades.map(([aid, nombre, dur, preds, min, max, cat, porDia, fijo]) => [
        aid, nombre, dur, preds, min, min === '' ? '' : dur, max, cat, porDia, '',
        // Avance y restricciones vacíos; el costo fijo en su columna.
        ...Array.from({ length: vacias }, (_, j) => (j === 7 ? fijo : '')),
      ]),
    ],
  };
  const calendario: HojaAEscribir = {
    nombre: HOJA_CALENDARIO,
    valores: [
      ['Inicio del proyecto', inicio],
      ['Fecha de corte', '', 'Solo si registras avance (inicio o fin real): el día desde el que se cuenta lo que queda'],
      ['Costo indirecto por día', e.costoIndirectoDia, 'Administración, vigilancia, alquileres: se paga por cada día laborable que dura el proyecto'],
      ['Días laborables', ''],
      ...DIAS.map((d, i) => [d, e.laborables[i] ? 'Sí' : 'No']),
      [''],
      ['Festivos', 'Escribe los festivos de tu país debajo, uno por fila'],
    ],
    formatos: { 1: FORMATO_FECHA },
    filaEncabezado: -1,
    primeraFilaDatos: 0,
    anchos: [22, 40, 60],
    formatosRango: [{ fila: 2, col: 1, filas: 1, cols: 1, formato: '#,##0' }],
  };
  const riesgos: HojaAEscribir = {
    nombre: HOJA_RIESGOS,
    valores: [
      ['Riesgos de plazo — cada uno alarga a la vez todas sus actividades. Los de este ejemplo son típicos del sector: revísalos con tu equipo'],
      [''],
      ENCABEZADO_RIESGOS,
      ...e.riesgos.map((r) => [...r, 'Abierto']),
    ],
    formatos: { 2: '0%', 3: '0%', 4: '0%', 5: '0%', 11: '0%', 12: '0%', 13: '0%', 14: '0%' },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [6, 44, 12, 15, 20, 15, 30, 15, 44, 22, 20, 20, 22, 26, 22, 20, 12],
  };
  // La fecha del contrato: el fin del hito en el plan más el margen (días naturales).
  const lectura = leerCronograma(actividades.valores, calendario.valores);
  const cpm = lectura.cronograma ? calcularCPM(lectura.cronograma) : null;
  const fila = cpm?.ok ? cpm.filas.find((f) => f.id === e.hito.id) : undefined;
  if (!fila) throw new Error(`El ejemplo «${id}» no se puede calcular`);
  const hitos: HojaAEscribir = {
    nombre: HOJA_HITOS,
    valores: [
      ['Hitos contractuales — el ID de la actividad (de «Actividades»), la fecha que fija el contrato y, si hay, la multa por día natural de retraso y su tope'],
      [''],
      ['Hito (ID)', 'Fecha contractual', 'Multa por día de retraso', 'Tope de la multa', 'Nota'],
      [e.hito.id, fila.fechaFin + e.hito.margen, e.hito.multaDia, e.hito.tope, e.hito.nota],
    ],
    formatos: { 0: '@', 1: FORMATO_FECHA },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [12, 18, 24, 18, 40],
  };
  return { actividades, calendario, riesgos, hitos };
}
