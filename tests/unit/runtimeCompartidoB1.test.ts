/**
 * B1, runtime compartido: el manifiesto, las acciones de la cinta y el paso
 * de resultados en memoria entre el panel y las funciones.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  almacenEnMemoria, anotarCeldaPendiente, direccionSinLibro, ponerAlmacenEnMemoria, tomarCeldasPendientes,
} from '../../excel/resultadosEnHoja.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';

const manifiesto = readFileSync(resolve(__dirname, '../../manifest.xml'), 'utf8');
const sinComentarios = manifiesto.replace(/<!--[\s\S]*?-->/g, '');

describe('el manifiesto (B1)', () => {
  it('declara el runtime compartido de larga vida y lo exige', () => {
    expect(sinComentarios).toMatch(/<Set Name="SharedRuntime" MinVersion="1\.1" \/>/);
    expect(sinComentarios).toMatch(/<Runtime resid="Panel\.Url" lifetime="long" \/>/);
  });

  it('el panel, la cinta y las funciones usan la misma página (si no, el runtime no se comparte)', () => {
    expect(sinComentarios).toMatch(/<FunctionFile resid="Panel\.Url" \/>/);
    expect(sinComentarios).toMatch(/<Page>\s*<SourceLocation resid="Panel\.Url" \/>\s*<\/Page>/);
    expect(sinComentarios).toMatch(/<bt:Url id="Panel\.Url" DefaultValue="https:\/\/localhost:9090\/taskpane\.html" \/>/);
  });

  it('un solo panel: ningún botón abre su propio panel (TaskpaneId) y los cuatro ejecutan una acción', () => {
    expect(sinComentarios).not.toMatch(/<TaskpaneId>/);
    expect(sinComentarios).not.toMatch(/ShowTaskpane/);
    for (const accion of ['mostrarModelo', 'mostrarResultados', 'mostrarConfiguracion', 'mostrarDiagnostico']) {
      expect(sinComentarios).toContain(`<FunctionName>${accion}</FunctionName>`);
    }
  });

  it('no quedan referencias a las páginas que se quitaron', () => {
    expect(sinComentarios).not.toMatch(/commands\.html|funciones\.html|Comandos\.Url|Funciones\.Page\.Url/);
  });

  it('el <Runtimes> va justo después de <Host>, antes de <AllFormFactors> (el orden importa)', () => {
    expect(sinComentarios).toMatch(/<Host xsi:type="Workbook">\s*<Runtimes>[\s\S]*?<\/Runtimes>\s*<AllFormFactors>/);
  });

  it('taskpane.html carga funciones.js (es la página de las funciones)', () => {
    const html = readFileSync(resolve(__dirname, '../../ui/taskpane.html'), 'utf8');
    expect(html).toMatch(/<script src="\.\/funciones\.js"><\/script>/);
    expect(html.indexOf('office.js')).toBeLessThan(html.indexOf('funciones.js'));
  });
});

describe('las acciones de la cinta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('cada botón pone su pestaña, muestra el panel y avisa a Office de que terminó', async () => {
    const acciones = new Map<string, (e: { completed(): void }) => void>();
    const mostrar = vi.fn(async () => {});
    const eventos: string[] = [];
    vi.stubGlobal('Office', { actions: { associate: (id: string, f: (e: { completed(): void }) => void) => acciones.set(id, f) }, addin: { showAsTaskpane: mostrar } });
    vi.stubGlobal('window', {
      location: { hash: '#modelo' },
      dispatchEvent: (e: CustomEvent) => {
        eventos.push(String(e.detail));
        return true;
      },
    });
    const { registrarAcciones } = await import('../../ui/acciones.ts');
    registrarAcciones();
    expect([...acciones.keys()].sort()).toEqual(['mostrarConfiguracion', 'mostrarDiagnostico', 'mostrarModelo', 'mostrarResultados']);

    const completado = vi.fn();
    acciones.get('mostrarResultados')?.({ completed: completado });
    await vi.waitFor(() => expect(completado).toHaveBeenCalled());
    expect((globalThis as unknown as { window: { location: { hash: string } } }).window.location.hash).toBe('resultados');
    expect(eventos).toEqual(['resultados']);
    expect(mostrar).toHaveBeenCalledTimes(1);
  });

  it('si mostrar el panel falla, igualmente se da la acción por terminada', async () => {
    const acciones = new Map<string, (e: { completed(): void }) => void>();
    vi.stubGlobal('Office', { actions: { associate: (id: string, f: (e: { completed(): void }) => void) => acciones.set(id, f) }, addin: { showAsTaskpane: async () => { throw new Error('no'); } } });
    vi.stubGlobal('window', { location: { hash: '' }, dispatchEvent: () => true });
    const { registrarAcciones } = await import('../../ui/acciones.ts');
    registrarAcciones();
    const completado = vi.fn();
    acciones.get('mostrarModelo')?.({ completed: completado });
    await vi.waitFor(() => expect(completado).toHaveBeenCalled());
  });

  it('fuera de Office (el banco) no hace nada', async () => {
    vi.stubGlobal('Office', undefined);
    const { registrarAcciones } = await import('../../ui/acciones.ts');
    expect(() => registrarAcciones()).not.toThrow();
  });
});

describe('resultados en memoria entre panel y funciones', () => {
  it('el almacén se comparte por globalThis', () => {
    const a = { version: 1 as const, guardadoEn: 'x', salidas: {} };
    ponerAlmacenEnMemoria(a);
    expect(almacenEnMemoria()).toBe(a);
  });

  it('las celdas que dijeron «simula primero» se apuntan una vez y se recogen', () => {
    tomarCeldasPendientes();
    anotarCeldaPendiente('Pruebas!C40');
    anotarCeldaPendiente('Pruebas!C40');
    anotarCeldaPendiente(undefined);
    anotarCeldaPendiente('Pruebas!C41');
    expect(tomarCeldasPendientes()).toEqual(['Pruebas!C40', 'Pruebas!C41']);
    expect(tomarCeldasPendientes()).toEqual([]);
  });

  it('direccionSinLibro quita el nombre del libro que da Excel', () => {
    expect(direccionSinLibro('[Libro1]Pruebas!C40')).toBe('Pruebas!C40');
    expect(direccionSinLibro("'[Libro 1.xlsx]Mi hoja'!C40")).toBe("'Mi hoja'!C40");
    expect(direccionSinLibro('Pruebas!C40')).toBe('Pruebas!C40');
  });

  it('las funciones de resultados piden también su propia dirección', () => {
    const m = metadatosFunciones() as { functions: { id: string; options?: Record<string, boolean> }[] };
    expect(m.functions.find((f) => f.id === 'MEDIA')?.options).toEqual({ requiresParameterAddresses: true, requiresAddress: true });
  });
});
