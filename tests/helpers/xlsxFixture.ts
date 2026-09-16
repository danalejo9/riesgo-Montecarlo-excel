/**
 * Construye libros `.xlsx` mínimos en memoria para los tests del escáner.
 *
 * Se generan en lugar de guardar archivos binarios en el repositorio: así el
 * caso de prueba se lee en el propio test (se ve qué fórmula tiene cada celda)
 * y no hay que abrir Excel para cambiar un fixture.
 */

import { zipSync, strToU8 } from 'fflate';

export interface CeldaFixture {
  ref: string;
  formula?: string;
  valor?: string;
  /** Fórmula compartida: `maestra` trae el texto; el resto solo el `si`. */
  compartida?: { si: string; maestra: boolean; rango?: string };
  matricial?: boolean;
}

export interface HojaFixture {
  nombre: string;
  celdas: CeldaFixture[];
}

export interface LibroFixture {
  hojas: HojaFixture[];
  nombresDefinidos?: string[];
  tablas?: number;
  vba?: boolean;
  powerQuery?: boolean;
  enlacesExternos?: number;
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function construirXlsx(libro: LibroFixture): Uint8Array {
  const archivos: Record<string, Uint8Array> = {};

  const sheets = libro.hojas
    .map((h, i) => `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');

  const definedNames = (libro.nombresDefinidos ?? []).length
    ? `<definedNames>${(libro.nombresDefinidos ?? [])
        .map((n) => `<definedName name="${escapar(n)}">Hoja1!$A$1</definedName>`)
        .join('')}</definedNames>`
    : '';

  archivos['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${sheets}</sheets>${definedNames}</workbook>`,
  );

  archivos['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0"?><Relationships>${libro.hojas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
  );

  libro.hojas.forEach((hoja, i) => {
    const porFila = new Map<number, CeldaFixture[]>();
    for (const c of hoja.celdas) {
      const fila = Number(/\d+/.exec(c.ref)?.[0] ?? 1);
      const lista = porFila.get(fila) ?? [];
      lista.push(c);
      porFila.set(fila, lista);
    }

    const filas = [...porFila.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([fila, celdas]) => {
        const cs = celdas
          .map((c) => {
            let f = '';
            if (c.compartida) {
              const attrs = `t="shared" si="${c.compartida.si}"` +
                (c.compartida.rango ? ` ref="${c.compartida.rango}"` : '');
              f = c.compartida.maestra
                ? `<f ${attrs}>${escapar(c.formula ?? '')}</f>`
                : `<f ${attrs}/>`;
            } else if (c.formula !== undefined) {
              f = `<f${c.matricial ? ' t="array"' : ''}>${escapar(c.formula)}</f>`;
            }
            const v = c.valor !== undefined ? `<v>${escapar(c.valor)}</v>` : '';
            return `<c r="${c.ref}">${f}${v}</c>`;
          })
          .join('');
        return `<row r="${fila}">${cs}</row>`;
      })
      .join('');

    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${filas}</sheetData></worksheet>`,
    );
  });

  for (let t = 1; t <= (libro.tablas ?? 0); t++) {
    archivos[`xl/tables/table${t}.xml`] = strToU8(`<?xml version="1.0"?><table id="${t}"/>`);
  }
  for (let e = 1; e <= (libro.enlacesExternos ?? 0); e++) {
    archivos[`xl/externalLinks/externalLink${e}.xml`] = strToU8('<externalLink/>');
  }
  if (libro.vba) archivos['xl/vbaProject.bin'] = new Uint8Array([0, 1, 2, 3]);
  if (libro.powerQuery) {
    archivos['customXml/item1.xml'] = strToU8('<DataMashup xmlns="http://schemas.microsoft.com/DataMashup"/>');
  }

  return zipSync(archivos);
}
