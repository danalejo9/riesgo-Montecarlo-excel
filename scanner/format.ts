/**
 * Presentación del informe.
 *
 * El objetivo no es enseñar números bonitos, es que una sola lectura conteste
 * "¿puedo simular esto rápido, y si no, por qué exactamente?". Por eso lo
 * primero que aparece es el veredicto, no las estadísticas.
 */

import { ETIQUETA_NIVEL, type Nivel } from './catalog.ts';
import type { Informe } from './analyze.ts';

/**
 * Veredicto.
 *
 * Deliberadamente **no** hay un umbral de porcentaje para el verde: basta una
 * sola celda bloqueante para que el motor rápido no pueda evaluar el modelo si
 * esa celda cae en el camino entre una entrada y una salida. Un "99,8 %
 * compatible" con tres celdas que lo impiden es exactamente la clase de
 * respuesta tranquilizadora y falsa que este escáner existe para evitar.
 *
 * El porcentaje sí sirve para medir *cuánto* falta, y por eso se muestra.
 */
export function veredicto(inf: Informe): 'compatible' | 'casi' | 'incompatible' {
  if (inf.bloqueantes.length === 0) return 'compatible';
  if (inf.coberturaN0N1 >= 95) return 'casi';
  return 'incompatible';
}

export function formatearTexto(inf: Informe): string {
  const l: string[] = [];
  const v = veredicto(inf);

  l.push('');
  l.push(`══ ${inf.archivo}`);
  l.push('');

  const celdasBloqueadas = inf.formulasPorNivel.n2 +
    inf.formulasPorNivel['no-soportada'] + inf.formulasPorNivel.desconocida;

  if (v === 'compatible') {
    l.push('  ✅  Compatible con el motor rápido');
    l.push('      Ninguna fórmula queda fuera del catálogo Nivel 0 + Nivel 1.');
  } else if (v === 'casi') {
    l.push(`  ⚠️   Casi compatible — ${miles(celdasBloqueadas)} fórmula(s) lo impiden`);
    l.push(`      Son pocas (${inf.coberturaN0N1} % del libro ya está cubierto): merece la pena`);
    l.push('      mirar si se pueden reescribir, o añadir esas funciones al motor.');
  } else {
    l.push(`  ⛔  No compatible tal cual — ${miles(celdasBloqueadas)} fórmula(s) lo impiden`);
    l.push(`      Cubierto: ${inf.coberturaN0N1} % de las fórmulas.`);
  }
  l.push(`      Cobertura solo con Nivel 0: ${inf.coberturaN0} %`);
  l.push('');

  l.push('  Tamaño');
  l.push(`    Hojas ................... ${inf.hojas}`);
  l.push(`    Celdas con contenido .... ${miles(inf.celdasConContenido)}`);
  l.push(`    Fórmulas ................ ${miles(inf.formulas)}` +
    (inf.formulasCompartidas > 0 ? `  (${miles(inf.formulasCompartidas)} compartidas)` : ''));
  l.push(`    Referencias por fórmula . ${inf.referenciasPorFormula}`);
  l.push(`    Profundidad de cadena ... ${inf.profundidad} (cota inferior)`);
  l.push('');

  if (inf.bloqueantes.length > 0) {
    l.push('  Funciones que impiden el motor rápido');
    for (const f of inf.bloqueantes.slice(0, 25)) {
      l.push(
        `    ${f.nombre.padEnd(22)} ${usos(f.veces)}   ` +
        `${etiqueta(f)}   p. ej. ${f.ejemplo}`,
      );
    }
    if (inf.bloqueantes.length > 25) {
      l.push(`    … y ${inf.bloqueantes.length - 25} más.`);
    }
    l.push('');
  }

  const señales: string[] = [];
  if (inf.tieneVba) señales.push('macros VBA');
  if (inf.tienePowerQuery) señales.push('Power Query o conexiones externas');
  if (inf.enlacesExternos > 0) señales.push(`${inf.enlacesExternos} enlace(s) a otros libros`);
  if (inf.derrames > 0) señales.push(`${inf.derrames} referencia(s) de derrame (matrices dinámicas)`);
  if (inf.formulasMatriciales > 0) señales.push(`${miles(inf.formulasMatriciales)} fórmula(s) matriciales`);
  if (inf.celdasVolatiles > 0) señales.push(`${miles(inf.celdasVolatiles)} celda(s) con funciones volátiles`);
  if (inf.referenciasExternas > 0) señales.push(`${miles(inf.referenciasExternas)} fórmula(s) con referencias externas`);

  if (señales.length > 0) {
    l.push('  Señales que requieren atención');
    for (const s of señales) l.push(`    · ${s}`);
    l.push('');
  }

  l.push('  Estructura');
  l.push(`    Tablas .................. ${inf.tablas}`);
  l.push(`    Nombres definidos ....... ${inf.nombresDefinidos}`);
  l.push('');

  l.push('  Funciones más usadas');
  for (const f of inf.funciones.slice(0, 15)) {
    l.push(`    ${f.nombre.padEnd(22)} ${usos(f.veces)}   ${etiqueta(f)}`);
  }
  if (inf.funciones.length === 0) l.push('    (ninguna: el libro no tiene llamadas a funciones)');
  l.push('');

  if (inf.rangosDemasiadoAnchos > 0) {
    l.push(`  Nota: ${inf.rangosDemasiadoAnchos} rango(s) muy anchos no se expandieron al medir la profundidad.`);
  }
  for (const a of inf.avisos) l.push(`  Aviso: ${a}`);

  return l.join('\n');
}

export function formatearResumen(informes: Informe[]): string {
  if (informes.length < 2) return '';

  const l: string[] = ['', '══ Resumen de los ' + informes.length + ' libros', ''];

  const totalFormulas = informes.reduce((s, i) => s + i.formulas, 0);
  const cubiertas = informes.reduce(
    (s, i) => s + (i.formulasPorNivel.n0 + i.formulasPorNivel.propia + i.formulasPorNivel.n1),
    0,
  );
  const global = totalFormulas === 0 ? 0 : Math.round((cubiertas / totalFormulas) * 1000) / 10;

  l.push(`  Fórmulas en total ....... ${miles(totalFormulas)}`);
  l.push(`  Cobertura Nivel 0 + 1 ... ${global} %`);
  l.push('');

  // Las funciones bloqueantes agregadas son la lista de trabajo real de E5:
  // se implementan por frecuencia, no por intuición.
  const agregado = new Map<string, { veces: number; nivel: string }>();
  for (const inf of informes) {
    for (const f of inf.bloqueantes) {
      const prev = agregado.get(f.nombre);
      if (prev) prev.veces += f.veces;
      else agregado.set(f.nombre, { veces: f.veces, nivel: etiqueta(f) });
    }
  }

  if (agregado.size > 0) {
    l.push('  Bloqueantes en conjunto, por frecuencia (orden de trabajo para E5)');
    const orden = [...agregado.entries()].sort((a, b) => b[1].veces - a[1].veces);
    for (const [nombre, d] of orden.slice(0, 30)) {
      l.push(`    ${nombre.padEnd(22)} ${usos(d.veces)}   ${d.nivel}`);
    }
  } else {
    l.push('  No hay funciones bloqueantes en ningún libro.');
  }

  return l.join('\n');
}

function etiqueta(f: { nivel: Nivel; propia: boolean }): string {
  return f.propia ? 'Declaración del complemento' : ETIQUETA_NIVEL[f.nivel];
}

function usos(n: number): string {
  return `${miles(n).padStart(7)} ${n === 1 ? 'uso ' : 'usos'}`;
}

function miles(n: number): string {
  return n.toLocaleString('es-ES');
}
