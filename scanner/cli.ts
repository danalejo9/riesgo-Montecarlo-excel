/**
 * Escáner de compatibilidad — interfaz de línea de comandos.
 *
 *   npm run scan -- "C:\ruta\Presupuesto.xlsx" [más libros...] [--json salida.json]
 *
 * Lee los libros del disco, no los abre en Excel y **no envía nada a ninguna
 * parte**: no hay una sola llamada de red en todo el escáner. Es lo que permite
 * pasarlo por presupuestos con datos sensibles (requisito R2).
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { analizar, type Informe } from './analyze.ts';
import { formatearResumen, formatearTexto } from './format.ts';
import { leerLibro } from './xlsx.ts';

export function escanearArchivo(ruta: string): Informe {
  const datos = readFileSync(ruta);
  const libro = leerLibro(new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength));
  return analizar(basename(ruta), libro);
}

function main(argv: string[]): number {
  const rutas: string[] = [];
  let salidaJson: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--json') {
      salidaJson = argv[++i] ?? 'informe-compatibilidad.json';
    } else if (a === '--help' || a === '-h') {
      console.log(AYUDA);
      return 0;
    } else {
      rutas.push(a);
    }
  }

  if (rutas.length === 0) {
    console.log(AYUDA);
    return 1;
  }

  const informes: Informe[] = [];
  let fallos = 0;

  for (const ruta of rutas) {
    try {
      if (!statSync(ruta).isFile()) {
        console.error(`\n  ⛔  No es un archivo: ${ruta}`);
        fallos++;
        continue;
      }
      if (!/\.xlsx?m?$/i.test(ruta)) {
        console.error(
          `\n  ⛔  ${basename(ruta)}: solo se pueden leer .xlsx y .xlsm.` +
          `\n      El formato .xls antiguo es binario; ábrelo en Excel y guárdalo como .xlsx.`,
        );
        fallos++;
        continue;
      }

      const informe = escanearArchivo(ruta);
      informes.push(informe);
      console.log(formatearTexto(informe));
    } catch (e) {
      fallos++;
      console.error(`\n  ⛔  ${basename(ruta)}: no se pudo leer — ${(e as Error).message}`);
    }
  }

  const resumen = formatearResumen(informes);
  if (resumen) console.log(resumen);

  if (salidaJson && informes.length > 0) {
    writeFileSync(salidaJson, JSON.stringify(informes, null, 2), 'utf8');
    console.log(`\n  Informe guardado en ${salidaJson}`);
  }

  console.log('');
  return fallos > 0 && informes.length === 0 ? 1 : 0;
}

const AYUDA = `
Escáner de compatibilidad — riesgo-montecarlo-excel

  npm run scan -- <libro.xlsx> [más libros...] [--json salida.json]

Dice qué porcentaje de las fórmulas de cada libro podría evaluar el motor
rápido, y qué funciones concretas lo impiden. Todo local: no abre Excel y no
envía nada a ninguna parte.

Opciones
  --json <archivo>   guarda el informe completo en JSON
  -h, --help         esta ayuda
`;

// Distingue ejecutar el archivo de importarlo desde un test.
if ((import.meta as { main?: boolean }).main === true) {
  process.exitCode = main(process.argv.slice(2));
}
