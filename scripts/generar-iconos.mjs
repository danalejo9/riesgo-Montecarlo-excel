/**
 * Genera los iconos PNG de la cinta (U3.2) a partir de SVG sencillos, con el
 * Chromium de Playwright: `node scripts/generar-iconos.mjs`. Estilo de los
 * que ya había: planos, un color, sin texto.
 */
import { chromium } from 'playwright'; // con Playwright instalado (global o en el proyecto)
import { writeFileSync } from 'node:fs';

const AZUL = '#2B7CD3', VERDE = '#217346', ROJO = '#C43E1C', MORADO = '#7A4FB5', GRIS = '#5B6570', OCRE = '#B8860B';
const ICONOS = {
  iteraciones: `<rect x="10" y="14" width="44" height="10" rx="2" fill="${AZUL}" opacity=".45"/><rect x="10" y="30" width="44" height="10" rx="2" fill="${AZUL}" opacity=".7"/><rect x="10" y="46" width="44" height="10" rx="2" fill="${AZUL}"/>`,
  distribucion: `<path d="M4 56 C18 56 20 10 32 10 C44 10 46 56 60 56 Z" fill="${AZUL}" opacity=".85"/><rect x="19" y="6" width="4" height="54" fill="${ROJO}"/><rect x="41" y="6" width="4" height="54" fill="${ROJO}"/>`,
  ajustar: `<rect x="6" y="40" width="9" height="18" fill="${VERDE}" opacity=".6"/><rect x="17" y="24" width="9" height="34" fill="${VERDE}" opacity=".6"/><rect x="28" y="14" width="9" height="44" fill="${VERDE}" opacity=".6"/><rect x="39" y="26" width="9" height="32" fill="${VERDE}" opacity=".6"/><rect x="50" y="42" width="9" height="16" fill="${VERDE}" opacity=".6"/><path d="M4 56 C16 50 22 10 32 10 C44 10 48 48 60 54" stroke="${VERDE}" stroke-width="4" fill="none"/>`,
  escenarios: `<path d="M4 56 C14 56 16 16 26 16 C36 16 38 56 48 56 Z" fill="${MORADO}" opacity=".45"/><path d="M16 56 C26 56 28 8 38 8 C48 8 50 56 60 56 Z" fill="${MORADO}" opacity=".8"/>`,
  volcar: `<rect x="8" y="8" width="48" height="48" rx="3" fill="#fff" stroke="${VERDE}" stroke-width="4"/><path d="M8 22 H56 M8 36 H56 M24 8 V56" stroke="${VERDE}" stroke-width="4"/><rect x="8" y="8" width="48" height="14" fill="${VERDE}"/>`,
  pdf: `<path d="M14 4 H40 L52 16 V60 H14 Z" fill="#fff" stroke="${ROJO}" stroke-width="4" stroke-linejoin="round"/><path d="M40 4 V16 H52" fill="none" stroke="${ROJO}" stroke-width="4" stroke-linejoin="round"/><rect x="20" y="28" width="26" height="5" fill="${ROJO}"/><rect x="20" y="38" width="26" height="5" fill="${ROJO}"/><rect x="20" y="48" width="16" height="5" fill="${ROJO}"/>`,
  ayuda: `<circle cx="32" cy="32" r="27" fill="${AZUL}"/><path d="M24 25 C24 14 40 14 40 24 C40 32 32 31 32 40" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="32" cy="50" r="4" fill="#fff"/>`,
  ejemplos: `<rect x="16" y="6" width="38" height="46" rx="3" fill="${OCRE}" opacity=".45"/><rect x="10" y="12" width="38" height="46" rx="3" fill="#fff" stroke="${OCRE}" stroke-width="4"/><path d="M18 26 H40 M18 36 H40 M18 46 H32" stroke="${OCRE}" stroke-width="4"/>`,
  lista: `<rect x="6" y="10" width="10" height="10" fill="#E3B505"/><rect x="22" y="12" width="36" height="6" fill="${GRIS}"/><rect x="6" y="27" width="10" height="10" fill="${VERDE}"/><rect x="22" y="29" width="36" height="6" fill="${GRIS}"/><rect x="6" y="44" width="10" height="10" fill="#E3B505"/><rect x="22" y="46" width="36" height="6" fill="${GRIS}"/>`,
  detener: `<rect x="12" y="12" width="40" height="40" rx="4" fill="${ROJO}"/>`,
  cronograma: `<rect x="6" y="10" width="24" height="9" rx="2" fill="${AZUL}"/><rect x="22" y="27" width="28" height="9" rx="2" fill="${ROJO}"/><rect x="36" y="44" width="22" height="9" rx="2" fill="${ROJO}"/><path d="M30 14.5 H34 V27 M50 31.5 H52 V44" stroke="${GRIS}" stroke-width="2.5" fill="none"/>`,
  calidad: `<circle cx="32" cy="12" r="8" fill="${ROJO}"/><circle cx="32" cy="32" r="8" fill="#E3B505"/><circle cx="32" cy="52" r="8" fill="${VERDE}"/>`,
  simularcronograma: `<rect x="6" y="12" width="26" height="9" rx="2" fill="${AZUL}" opacity=".6"/><rect x="20" y="28" width="30" height="9" rx="2" fill="${AZUL}" opacity=".8"/><path d="M8 58 C22 58 28 44 36 44 C44 44 48 58 60 58 Z" fill="${ROJO}" opacity=".85"/>`,
  gantt: `<rect x="4" y="8" width="14" height="48" fill="#fff" stroke="${GRIS}" stroke-width="2"/><path d="M4 24 H18 M4 40 H18" stroke="${GRIS}" stroke-width="2"/><rect x="22" y="11" width="18" height="9" rx="1.5" fill="${ROJO}"/><rect x="30" y="27" width="22" height="9" rx="1.5" fill="${AZUL}"/><path d="M52 49 L57 44 L62 49 L57 54 Z" fill="${ROJO}"/><path d="M40 15.5 H44 V44 H50" stroke="${ROJO}" stroke-width="2.5" fill="none"/>`,
  diagnostico: `<path d="M4 34 H18 L24 18 L34 50 L42 26 L46 34 H60" stroke="${GRIS}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
};

const nav = await chromium.launch();
const p = await nav.newPage();
// Con nombres (`node scripts/generar-iconos.mjs gantt`), solo esos.
const solo = process.argv.slice(2);
for (const [nombre, dibujo] of Object.entries(ICONOS).filter(([n]) => solo.length === 0 || solo.includes(n))) {
  for (const t of [16, 32, 80]) {
    await p.setViewportSize({ width: t, height: t });
    await p.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 64 64">${dibujo}</svg></body></html>`);
    writeFileSync(`public/icon-${nombre}-${t}.png`, await p.screenshot({ omitBackground: true }));
  }
}
await nav.close();
console.log(`${solo.length || Object.keys(ICONOS).length} iconos × 3 tamaños en public/`);
