/**
 * Editor de la plantilla del informe PDF (V3), en Configuración: portada,
 * logo, pie, papel y secciones de los dos informes. Se guarda en el libro
 * (`excel/almacenPlantilla.ts`) con un botón, no a cada tecla.
 */

import { useEffect, useRef, useState } from 'react';

import { guardarPlantillaInforme, leerPlantillaInforme } from '../excel/almacenPlantilla.ts';
import {
  LOGO_MAXIMO, SECCIONES_COSTOS, SECCIONES_CRONOGRAMA, moverSeccion, normalizarPlantilla, plantillaPorDefecto,
  type PlantillaInforme, type Seccion,
} from '../excel/plantillaInforme.ts';
import { textosPlantilla as T } from './textos/es.ts';

/** Lado máximo del logo, en píxeles: se imprime a unos 56 px de alto. */
const LOGO_ALTO = 160;
const LOGO_ANCHO = 480;

export function EditorPlantilla() {
  const [p, setP] = useState<PlantillaInforme | null>(null);
  const [guardada, setGuardada] = useState<string>('');
  const [nota, setNota] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    leerPlantillaInforme()
      .then((x) => {
        if (!vivo) return;
        setP(x);
        setGuardada(JSON.stringify(x));
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setP(plantillaPorDefecto());
        setNota(T.noSeLeyo(mensaje(e)));
      });
    return () => { vivo = false; };
  }, []);

  if (!p) return <section><h2>{T.titulo}</h2><p className="tenue">{T.cargando}</p></section>;

  const cambiar = (c: Partial<PlantillaInforme>) => {
    setNota(null);
    setP(normalizarPlantilla({ ...p, ...c }));
  };
  const guardar = async () => {
    try {
      await guardarPlantillaInforme(p);
      setGuardada(JSON.stringify(p));
      setNota(T.guardada);
    } catch (e) {
      setNota(T.noSeGuardo(mensaje(e)));
    }
  };
  const elegirLogo = async (f: File) => {
    try {
      const logo = await reducirLogo(f);
      if (!logo) setNota(T.logoGrande);
      else cambiar({ logo });
    } catch {
      setNota(T.logoMalo);
    }
  };
  const cambios = JSON.stringify(p) !== guardada;

  return (
    <section>
      <h2>{T.titulo}</h2>
      <p className="tenue">{T.intro}</p>
      <div className="parametros">
        <Texto etiqueta={T.tituloInforme} valor={p.titulo} pista={T.tituloAyuda} max={200} alCambiar={(titulo) => cambiar({ titulo })} ancho />
        <Texto etiqueta={T.subtitulo} valor={p.subtitulo} max={200} alCambiar={(subtitulo) => cambiar({ subtitulo })} ancho />
        <Texto etiqueta={T.empresa} valor={p.empresa} max={150} alCambiar={(empresa) => cambiar({ empresa })} />
        <Texto etiqueta={T.autor} valor={p.autor} max={150} alCambiar={(autor) => cambiar({ autor })} />
        <Texto etiqueta={T.pie} valor={p.pie} pista={T.piePista} max={200} alCambiar={(pie) => cambiar({ pie })} ancho />
        <label className="campo">
          <span className="tenue">{T.tamano}</span>
          <select value={p.tamano} onChange={(e) => cambiar({ tamano: e.target.value as PlantillaInforme['tamano'] })}>
            {(Object.keys(T.tamanos) as Array<keyof typeof T.tamanos>).map((k) => <option key={k} value={k}>{T.tamanos[k]}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="tenue">{T.orientacion}</span>
          <select value={p.orientacion} onChange={(e) => cambiar({ orientacion: e.target.value as PlantillaInforme['orientacion'] })}>
            {(Object.keys(T.orientaciones) as Array<keyof typeof T.orientaciones>).map((k) => <option key={k} value={k}>{T.orientaciones[k]}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="tenue">{T.color}</span>
          <input type="color" value={p.color} onChange={(e) => cambiar({ color: e.target.value })} />
        </label>
        <label className="campo casilla">
          <input type="checkbox" checked={p.numeroPagina} onChange={(e) => cambiar({ numeroPagina: e.target.checked })} />
          <span>{T.numeroPagina}</span>
        </label>
        <div className="campo ancho">
          <span className="tenue">{T.logo}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {p.logo && <img src={p.logo} alt="" style={{ maxHeight: 40, maxWidth: 160, objectFit: 'contain', background: '#fff' }} />}
            <button type="button" onClick={() => archivo.current?.click()}>{T.logoElegir}</button>
            <input ref={archivo} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void elegirLogo(f); e.target.value = ''; }} />
            {p.logo && <button type="button" onClick={() => { setNota(null); setP(sinLogo(p)); }}>{T.logoQuitar}</button>}
          </span>
          <span className="tenue ayuda">{T.logoAyuda}</span>
        </div>
      </div>

      <ListaSecciones titulo={T.seccionesCostos} lista={p.seccionesCostos} nombres={SECCIONES_COSTOS}
        alCambiar={(seccionesCostos) => cambiar({ seccionesCostos })} />
      <ListaSecciones titulo={T.seccionesCronograma} lista={p.seccionesCronograma} nombres={SECCIONES_CRONOGRAMA}
        alCambiar={(seccionesCronograma) => cambiar({ seccionesCronograma })} />

      <p>
        <button type="button" className="principal" onClick={() => void guardar()} disabled={!cambios}>{T.guardar}</button>{' '}
        <button type="button" onClick={() => cambiar(plantillaPorDefecto())}>{T.restablecer}</button>{' '}
        {cambios && <span className="tenue">{T.sinGuardar}</span>}
      </p>
      {nota && <p className={nota === T.guardada ? 'aviso-ok' : 'aviso-linea'}>{nota}</p>}
    </section>
  );
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

const MINI = { padding: '0 6px', minWidth: 0, lineHeight: 1.3 } as const;

function sinLogo(p: PlantillaInforme): PlantillaInforme {
  const copia = { ...p };
  delete copia.logo;
  return copia;
}

function Texto({ etiqueta, valor, pista, max, ancho, alCambiar }: {
  etiqueta: string; valor: string; pista?: string; max: number; ancho?: boolean; alCambiar: (v: string) => void;
}) {
  return (
    <label className={ancho ? 'campo ancho' : 'campo'}>
      <span className="tenue">{etiqueta}</span>
      <input type="text" value={valor} maxLength={max} placeholder={pista} onChange={(e) => alCambiar(e.target.value)} />
    </label>
  );
}

function ListaSecciones<Id extends string>({ titulo, lista, nombres, alCambiar }: {
  titulo: string;
  lista: ReadonlyArray<Seccion<Id>>;
  nombres: ReadonlyArray<{ id: Id; nombre: string }>;
  alCambiar: (l: Array<Seccion<Id>>) => void;
}) {
  const nombre = (id: Id) => nombres.find((n) => n.id === id)?.nombre ?? id;
  return (
    <fieldset className="secciones-informe" style={{ border: '1px solid var(--borde)', borderRadius: 4, margin: '10px 0', padding: '4px 10px 8px' }}>
      <legend className="tenue">{titulo}</legend>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {lista.map((s, i) => (
          <li key={s.id} style={{ display: 'list-item', margin: '2px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" aria-label={nombre(s.id)} checked={s.visible}
                onChange={(e) => alCambiar(lista.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)))} />
              <span className={s.visible ? '' : 'tenue'}>{nombre(s.id)}</span>
              <button type="button" style={MINI} aria-label={`${T.subir}: ${nombre(s.id)}`} title={T.subir} disabled={i === 0}
                onClick={() => alCambiar(moverSeccion(lista, s.id, -1))}>↑</button>
              <button type="button" style={MINI} aria-label={`${T.bajar}: ${nombre(s.id)}`} title={T.bajar} disabled={i === lista.length - 1}
                onClick={() => alCambiar(moverSeccion(lista, s.id, 1))}>↓</button>
            </span>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

/**
 * El logo reducido a la cabecera (a lo sumo LOGO_ANCHO × LOGO_ALTO) como
 * `data:`; en PNG si cabe (conserva la transparencia), si no en JPG sobre
 * blanco. `null` si ni así cabe en LOGO_MAXIMO.
 */
async function reducirLogo(f: File): Promise<string | null> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('imagen'));
      i.src = url;
    });
    const escala = Math.min(1, LOGO_ANCHO / img.naturalWidth, LOGO_ALTO / img.naturalHeight);
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('lienzo');
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const png = lienzo.toDataURL('image/png');
    if (png.length <= LOGO_MAXIMO) return png;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    for (const calidad of [0.85, 0.7, 0.5]) {
      const jpg = lienzo.toDataURL('image/jpeg', calidad);
      if (jpg.length <= LOGO_MAXIMO) return jpg;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
