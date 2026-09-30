/**
 * Textos del módulo Cronograma (decisión 23: idiomas como paquetes). Todo
 * texto nuevo del módulo nace aquí, no en el componente; otro idioma será otro
 * archivo con las mismas claves. Los textos del resto del panel se pasarán a
 * este catálogo en E10.
 */
export const textosCronograma = {
  pestana: 'Cronograma',
  titulo: 'Cronograma',
  intro:
    'Calcula las fechas de tu cronograma a partir de las hojas «Actividades» y «Calendario». ' +
    'Por ahora sin incertidumbre (camino crítico determinista); el Monte Carlo del plazo llega en la etapa P3.',
  sinCapacidad: 'Tu licencia no incluye el módulo Cronograma.',
  plantilla: 'Plantilla de cronograma',
  plantillaAyuda: 'Crea las hojas «Actividades» y «Calendario» con un ejemplo, si no existen.',
  plantillaCreada: (hojas: string[]) =>
    hojas.length === 0 ? 'Las dos hojas ya existían: no se ha tocado nada.' : `Creadas: ${hojas.join(' y ')}.`,
  calcular: 'Calcular cronograma',
  calculando: 'Calculando…',
  errores: 'Hay que corregir esto antes de calcular',
  avisos: 'Avisos',
  finProyecto: 'Fin del proyecto',
  dias: 'días laborables',
  criticas: 'Actividades críticas',
  escritoEn: (hoja: string) => `Resultado completo en la hoja «${hoja}».`,
  rutaCritica: 'Ruta crítica',
} as const;
