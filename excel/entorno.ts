/**
 * Lo primero que hay que saber al abrir el panel: **dónde estamos corriendo y
 * de qué APIs disponemos**.
 *
 * No es información decorativa. El complemento tiene que funcionar en Excel de
 * Windows y en Mac (decisión 1 del handoff), y las dos plataformas van por
 * versiones distintas de `ExcelApi`. Qué conjunto de requisitos hay disponible
 * decide qué se puede usar: leer fórmulas en lote, escribir rangos con nombre,
 * cambiar el modo de cálculo. Preguntarlo y enseñarlo es más barato que
 * descubrirlo por un fallo en casa de un usuario.
 *
 * `isSetSupported` es además la forma correcta de decidir, en vez de mirar el
 * número de versión de Office: Microsoft lo dice explícitamente, porque una
 * misma versión puede traer conjuntos distintos según el canal de
 * actualización.
 */

/** Versiones de `ExcelApi` que le importan a este complemento, y para qué. */
export const CONJUNTOS_RELEVANTES: ReadonlyArray<{ version: string; para: string }> = [
  { version: '1.1', para: 'leer y escribir rangos' },
  { version: '1.2', para: 'rangos con nombre' },
  { version: '1.4', para: 'nombres de libro y formato condicional' },
  { version: '1.7', para: 'ajustes del libro y estilos' },
  { version: '1.8', para: 'precedentes de una fórmula' },
  { version: '1.9', para: 'modo de cálculo y suspender el recálculo' },
  { version: '1.12', para: 'leer fórmulas en lote con más eficiencia' },
];

export interface EntornoOffice {
  /** 'Excel', 'Word'… o 'desconocido' si Office no lo informa. */
  host: string;
  /** 'PC', 'Mac', 'OfficeOnline', 'iOS'… */
  plataforma: string;
  /** Versión de Office que informa el propio host. */
  version: string;
  /** Idioma de la interfaz, que es de donde saldrá la configuración regional (decisión 17). */
  idioma: string;
  /** Qué conjuntos de `ExcelApi` hay disponibles aquí. */
  conjuntos: ReadonlyArray<{ version: string; para: string; disponible: boolean }>;
  /**
   * Si panel, cinta y funciones comparten proceso (B1). `true` si este Excel
   * admite `SharedRuntime 1.1`, que el manifiesto exige.
   */
  runtimeCompartido: boolean;
}

export function leerEntorno(): EntornoOffice {
  const diagnostico = Office.context.diagnostics;

  return {
    // `host` y `platform` se declaran como enumeraciones, pero en tiempo de
    // ejecución son cadenas ('Excel', 'PC'…) y aquí solo se enseñan.
    host: diagnostico?.host === undefined ? 'desconocido' : String(diagnostico.host),
    plataforma: diagnostico?.platform === undefined ? 'desconocida' : String(diagnostico.platform),
    version: diagnostico?.version ?? 'desconocida',
    idioma: Office.context.displayLanguage || 'desconocido',
    conjuntos: CONJUNTOS_RELEVANTES.map((c) => ({
      ...c,
      disponible: Office.context.requirements.isSetSupported('ExcelApi', c.version),
    })),
    runtimeCompartido: Office.context.requirements.isSetSupported('SharedRuntime', '1.1'),
  };
}

/** La versión más alta de `ExcelApi` disponible, para resumirlo en una línea. */
export function versionMaximaDisponible(entorno: EntornoOffice): string {
  const disponibles = entorno.conjuntos.filter((c) => c.disponible);
  return disponibles.length === 0 ? 'ninguna' : (disponibles[disponibles.length - 1] as { version: string }).version;
}
