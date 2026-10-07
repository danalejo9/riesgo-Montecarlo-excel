/**
 * V3: lo que la plantilla del informe cambia en las páginas impresas, común a
 * los dos informes (costos y cronograma): la regla de página (papel,
 * orientación, pie y número de página), el color de los títulos y la portada
 * con el logo, la empresa y el autor.
 */
import type { ReactNode } from 'react';

import { plantillaPorDefecto, reglaPagina, type PlantillaInforme } from '../excel/plantillaInforme.ts';

export function EstiloPlantilla({ p }: { p: PlantillaInforme | undefined }) {
  const x = p ?? plantillaPorDefecto();
  return <style>{`${reglaPagina(x)} .informe h1, .informe h2 { color: ${x.color}; } .informe .portada { border-bottom: 2px solid ${x.color}; padding-bottom: 8px; }`}</style>;
}

export function Portada({ p, titulo, fecha, children }: { p: PlantillaInforme | undefined; titulo: string; fecha: string; children?: ReactNode }) {
  return (
    <header className="portada">
      {(p?.logo || p?.empresa) && (
        <div className="marca-informe">
          {p.logo && <img src={p.logo} alt="" className="logo-informe" />}
          {p.empresa && <span>{p.empresa}</span>}
        </div>
      )}
      <h1>{p?.titulo || titulo}</h1>
      {p?.subtitulo && <p className="subtitulo-informe">{p.subtitulo}</p>}
      <p className="tenue">{fecha}{p?.autor ? ` · ${p.autor}` : ''}</p>
      {children}
    </header>
  );
}
