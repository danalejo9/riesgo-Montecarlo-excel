/**
 * Datos en la dirección de una página, comprimidos, detrás de `#d=`: el
 * fragmento no sale nunca del equipo (el navegador no lo envía al servidor).
 * Lo usan el informe imprimible (C7) y el explorador de distribución (U3.1).
 */

/** Base64 apto para URL, sin relleno. */
function aBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array {
  const b = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function transformar(bytes: Uint8Array, flujo: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const salida = new Blob([bytes.slice().buffer]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

export async function codificarJson(datos: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(datos));
  return aBase64Url(await transformar(json, new CompressionStream('deflate-raw')));
}

/** `null` si el código no se entiende (roto, recortado…): quien lo lee decide qué enseñar. */
export async function decodificarJson(codigo: string): Promise<unknown> {
  try {
    const json = await transformar(deBase64Url(codigo), new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(json)) as unknown;
  } catch {
    return null;
  }
}
