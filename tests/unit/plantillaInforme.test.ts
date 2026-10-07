/** V3: la plantilla del informe PDF (portada, papel, pie y secciones). */
import { describe, expect, it } from 'vitest';
import {
  LOGO_MAXIMO, moverSeccion, normalizarPlantilla, plantillaPorDefecto, reglaPagina, SECCIONES_COSTOS, SECCIONES_CRONOGRAMA, seccionesVisibles, textoCss,
} from '../../excel/plantillaInforme.ts';

describe('plantilla del informe', () => {
  it('por defecto: A4 vertical, número de página y todas las secciones en su orden', () => {
    const p = plantillaPorDefecto();
    expect(reglaPagina(p)).toBe('@page { size: A4 portrait; margin: 14mm 14mm 18mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #616161; } }');
    expect(seccionesVisibles(p.seccionesCronograma, SECCIONES_CRONOGRAMA)).toEqual(SECCIONES_CRONOGRAMA.map((s) => s.id));
    expect(seccionesVisibles(undefined, SECCIONES_COSTOS)).toEqual(SECCIONES_COSTOS.map((s) => s.id));
  });

  it('normaliza lo que viene del libro: completa, corrige y respeta el orden guardado', () => {
    const p = normalizarPlantilla({
      titulo: 'Obra X', color: 'rojo', tamano: 'Letter', orientacion: 'landscape', pie: 'Confidencial',
      logo: 'data:image/png;base64,AAAA', seccionesCronograma: [{ id: 'reserva', visible: true }, { id: 'fin', visible: false }, { id: 'nada' }, { id: 'reserva' }],
    });
    expect(p.color).toBe('#1F4E79');
    expect(p.logo).toBe('data:image/png;base64,AAAA');
    expect(p.seccionesCronograma.slice(0, 2)).toEqual([{ id: 'reserva', visible: true }, { id: 'fin', visible: false }]);
    expect(p.seccionesCronograma).toHaveLength(SECCIONES_CRONOGRAMA.length);
    expect(seccionesVisibles(p.seccionesCronograma, SECCIONES_CRONOGRAMA)[0]).toBe('reserva');
    expect(seccionesVisibles(p.seccionesCronograma, SECCIONES_CRONOGRAMA)).not.toContain('fin');
    expect(reglaPagina(p)).toMatch(/^@page \{ size: Letter landscape; .*@bottom-left \{ content: "Confidencial"/);
    expect(normalizarPlantilla({ logo: `data:image/png;base64,${'A'.repeat(LOGO_MAXIMO)}` }).logo).toBeUndefined();
    expect(normalizarPlantilla('basura')).toEqual(plantillaPorDefecto());
  });

  it('mover secciones y escapar el pie para CSS', () => {
    const l = plantillaPorDefecto().seccionesCostos;
    expect(moverSeccion(l, 'entradas', -1).map((s) => s.id).slice(0, 2)).toEqual(['entradas', 'ajustes']);
    expect(moverSeccion(l, 'ajustes', -1)).toEqual(l);
    expect(textoCss('Dice "hola"\n<b>')).toBe('"Dice \\"hola\\" b"');
  });
});
