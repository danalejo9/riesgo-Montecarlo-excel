/**
 * Lee una hoja de un `.xlsx` como una matriz de valores, igual que
 * `range.values` de Office.js: números (las fechas, como número de serie),
 * textos, booleanos y `''` en las celdas vacías. Para los tests que leen los
 * libros de `ejemplos/` (el del cronograma, sobre todo).
 */
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
const desescapar = (s: string) =>
  s.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => ENTIDADES[e] as string).replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

function columnaAIndice(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function leerHojaComoMatriz(ruta: string, hoja: string): unknown[][] | undefined {
  const zip = unzipSync(new Uint8Array(readFileSync(ruta)));
  const texto = (p: string) => (zip[p] ? new TextDecoder('utf-8').decode(zip[p]) : undefined);

  const rels = texto('xl/_rels/workbook.xml.rels') ?? '';
  const destino = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) destino.set(id, target.replace(/^\/?xl\//, ''));
  }
  let ruta_hoja: string | undefined;
  for (const m of (texto('xl/workbook.xml') ?? '').matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nombre = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (nombre !== undefined && desescapar(nombre) === hoja && rid) ruta_hoja = `xl/${destino.get(rid)}`;
  }
  if (!ruta_hoja) return undefined;

  const compartidas: string[] = [];
  for (const si of (texto('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    compartidas.push(desescapar([...(si[1] as string).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  }

  const filas: unknown[][] = [];
  const xml = texto(ruta_hoja) ?? '';
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1] as string;
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const col = columnaAIndice(ref[1] as string);
    const fila = Number(ref[2]) - 1;
    const tipo = /t="([^"]+)"/.exec(attrs)?.[1];
    const cuerpo = c[2] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    let valor: unknown = '';
    if (tipo === 's' && v !== undefined) valor = compartidas[Number(v)] ?? '';
    else if (tipo === 'inlineStr') valor = desescapar([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
    else if (tipo === 'str' && v !== undefined) valor = desescapar(v);
    else if (tipo === 'b' && v !== undefined) valor = v === '1';
    else if (v !== undefined) valor = Number(v);
    while (filas.length <= fila) filas.push([]);
    const f = filas[fila] as unknown[];
    while (f.length <= col) f.push('');
    f[col] = valor;
  }
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  return filas.map((f) => [...f, ...new Array<unknown>(ancho - f.length).fill('')]);
}
