/**
 * La página que descarga el archivo para MS Project o P6 (V9) desde el
 * navegador del sistema. Recibe el archivo en `#d=` (ver `ui/descarga.ts`).
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { aWindows1252 } from '../engine/cronograma/exportar.ts';
import { decodificarJson } from '../excel/codificacion.ts';
import { descargarDirecto, type ArchivoDescarga } from './descarga.ts';
import { textosExportar as T } from './textos/es.ts';
import './estilos.css';

function Exportar() {
  const [archivo, setArchivo] = useState<ArchivoDescarga | null | 'cargando'>('cargando');
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.hash.slice(1)).get('d');
    if (!codigo) {
      setArchivo(null);
      return;
    }
    void decodificarJson(codigo).then((d) => {
      const a = d as ArchivoDescarga | null;
      setArchivo(a && typeof a.nombre === 'string' && typeof a.texto === 'string' ? a : null);
    });
  }, []);
  if (archivo === 'cargando') return <p className="tenue">{T.preparando}</p>;
  if (!archivo) return <main style={{ padding: 16 }}><h1>{T.nada}</h1><p>{T.nadaAyuda}</p></main>;
  const bajar = () => {
    const bytes = archivo.windows1252 ? aWindows1252(archivo.texto) : new TextEncoder().encode(archivo.texto);
    descargarDirecto(bytes, archivo.nombre, archivo.tipo);
  };
  return (
    <main style={{ padding: 16, maxWidth: 640 }}>
      <h1>{T.titulo}</h1>
      <p><button type="button" className="principal" onClick={bajar}>{T.descargar(archivo.nombre)}</button></p>
      <p className="tenue">{archivo.nombre.endsWith('.xer') ? T.ayudaP6 : T.ayudaMsp}</p>
    </main>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Exportar /></StrictMode>);
