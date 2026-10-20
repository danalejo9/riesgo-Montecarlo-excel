/**
 * Prepara `dist/` para publicarlo en GitHub Pages: escribe el manifiesto de
 * producción (`dist/manifest.xml`), la página de descarga (`dist/index.html`)
 * y los instaladores de Windows. Uso, después de `npm run build`:
 *
 *     node scripts/publicar-manifiesto.mjs https://danalejo9.github.io/riesgo-Montecarlo-excel
 *
 * El manifiesto sale del de desarrollo (`manifest.xml`, que apunta a
 * `https://localhost:9090`) cambiando la dirección y el Id. El Id es otro a
 * propósito: así la versión publicada y la de desarrollo pueden estar
 * cargadas en el mismo Excel sin pisarse en la caché de Office.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ID_DESARROLLO = '6c55c606-966a-443c-b0af-ad9b854af48f';
const ID_PUBLICADO = '8ce16dfc-cbba-4ff4-88d1-4b1782101021';
const LOCAL = 'https://localhost:9090';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+/.test(url)) {
  console.error('Falta la dirección HTTPS donde se publica, p. ej. https://danalejo9.github.io/riesgo-Montecarlo-excel');
  process.exit(1);
}
const origen = new URL(url).origin;

let xml = readFileSync(join(raiz, 'manifest.xml'), 'utf8');
if (!xml.includes(`<Id>${ID_DESARROLLO}</Id>`)) {
  console.error('El Id del manifest.xml no es el esperado: revisa ID_DESARROLLO en este script.');
  process.exit(1);
}
xml = xml
  .replace(`<Id>${ID_DESARROLLO}</Id>`, `<Id>${ID_PUBLICADO}</Id>`)
  // AppDomain es un origen, sin ruta.
  .replace(`<AppDomain>${LOCAL}</AppDomain>`, `<AppDomain>${origen}</AppDomain>`)
  // El repositorio es privado: la ayuda que ven los colegas es la página de descarga.
  .replace(/<SupportUrl DefaultValue="[^"]*" \/>/, `<SupportUrl DefaultValue="${url}/" />`)
  .replaceAll(LOCAL, url);
if (xml.includes('localhost')) {
  console.error('Quedó alguna dirección localhost en el manifiesto de producción.');
  process.exit(1);
}
writeFileSync(join(raiz, 'dist/manifest.xml'), xml);

const version = /<Version>([^<]+)<\/Version>/.exec(xml)?.[1] ?? '';
const pagina = readFileSync(join(raiz, 'scripts/instalar.html'), 'utf8').replaceAll('{{VERSION}}', version);
writeFileSync(join(raiz, 'dist/index.html'), pagina);

// Los .cmd, con saltos de línea de Windows: con LF solos, cmd.exe se salta líneas.
for (const cmd of ['instalar-windows.cmd', 'desinstalar-windows.cmd']) {
  const texto = readFileSync(join(raiz, 'scripts', cmd), 'utf8')
    .replaceAll('{{URL}}', url)
    .replaceAll('{{VERSION}}', version)
    .replace(/\r?\n/g, '\r\n');
  writeFileSync(join(raiz, 'dist', cmd), texto);
}

console.log(`Manifiesto de producción (versión ${version}) apuntando a ${url}/`);
