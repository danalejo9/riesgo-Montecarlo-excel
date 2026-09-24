/**
 * `TEXTO(valor; formato)`: un número convertido a texto con un formato de
 * Excel.
 *
 * Es la función que más depende de la configuración regional, y por eso entra
 * después de ella. Depende por cuatro sitios a la vez:
 *
 * 1. **La cadena de formato se lee con los separadores del libro.** Excel la
 *    guarda tal como la escribió el usuario, en su idioma: en un libro español
 *    `"#.##0,00"` es "miles con punto, dos decimales con coma", y en uno inglés
 *    la misma cadena es otra cosa. Aquí se interpreta con `regionalActual()`.
 * 2. **El resultado sale con esos mismos separadores**: `1.234,50`.
 * 3. **Los nombres de meses y días, y el AM/PM, son del idioma**: `enero`,
 *    `lunes`, y `p. m.` (con un espacio duro en medio) en vez de `PM`.
 * 4. **Qué letras son códigos**, que no es lo que parece. La quinta tanda del
 *    libro de fidelidad lo aclaró con el Excel es-ES del usuario: el año se
 *    escribe con `y` también en español (`yyyy-mm-dd` funciona); `aaa` y
 *    `aaaa` son **el nombre del día** (`miércoles`), no el año; `a` y `aa`
 *    sueltas se escriben tal cual; y una letra que no es ningún código
 *    invalida el formato entero (`"Estándar"` es `#¡VALOR!`). La primera
 *    versión suponía lo contrario en los cuatro puntos.
 *
 * ---
 *
 * **Lo que cubre**: secciones (positivo; negativo; cero; texto), marcadores
 * `0`, `#` y `?`, separador de miles y su uso como escala (cada separador al
 * final divide entre mil), porcentaje, notación científica, texto literal
 * entre comillas o escapado con `\`, colores (`[Rojo]`, que se ignoran), y
 * fechas y horas con `d`, `m`, `a`/`y`, `h`, `s` y `AM/PM`.
 *
 * **Lo que no**: condiciones entre corchetes (`[>=100]`), fracciones (`# ?/?`)
 * y el código de relleno `*`. Una cadena con cualquiera de ellos devuelve
 * `#¡VALOR!` en vez de un resultado inventado: un texto con formato
 * equivocado parece correcto, y un error se ve.
 *
 * **Los nombres de meses y días en español salen de una tabla**, no de
 * Windows, que es de donde los saca Excel. Las abreviaturas pueden no coincidir
 * con las de una versión concreta de Windows ("sept" o "sep"). Está en la
 * quinta tanda del libro de fidelidad para averiguarlo.
 */

import { coercionTexto } from '../values/coercion.ts';
import {
  crearConstructor,
  desdeEscalar,
  errorEn,
  esInvariante,
  numeroEn,
  textoEn,
  tipoEn,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
  type ValorEscalar,
} from '../values/columna.ts';
import { regionalActual, type ConfiguracionRegional } from '../values/regional.ts';
import { partesDeSerie } from './fechas.ts';
import type { Argumento } from './types.ts';

const MESES: Record<string, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
/** Empiezan en domingo, que es el día 1 de `DIASEM` con el tipo por omisión. */
const DIAS: Record<string, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/**
 * Lo que escribe Excel en lugar de AM/PM. En español es `a. m.` / `p. m.`, con
 * un **espacio duro** (U+00A0) entre las dos partes: así lo grabó el Excel del
 * usuario en el caso T5-034. Un espacio normal daría un texto que se ve igual
 * y no es igual.
 */
const MERIDIANO: Record<string, [string, string]> = {
  es: ['a.\u00a0m.', 'p.\u00a0m.'],
  en: ['AM', 'PM'],
};

function lengua(r: ConfiguracionRegional): 'es' | 'en' {
  return r.idioma.toLowerCase().startsWith('es') ? 'es' : 'en';
}

// --- Troceado de la cadena de formato ----------------------------------------

type Pieza =
  | { tipo: 'literal'; texto: string }
  | { tipo: 'codigo'; texto: string };

/**
 * Parte una sección en piezas: literales (entre comillas, escapados con `\`,
 * o caracteres que no son códigos) y códigos. Los colores entre corchetes se
 * descartan; cualquier otro corchete es una condición que no se soporta.
 */
function trocear(seccion: string): Pieza[] | undefined {
  const piezas: Pieza[] = [];
  for (let i = 0; i < seccion.length; i++) {
    const ch = seccion[i] as string;
    if (ch === '"') {
      const fin = seccion.indexOf('"', i + 1);
      if (fin < 0) return undefined;
      piezas.push({ tipo: 'literal', texto: seccion.slice(i + 1, fin) });
      i = fin;
    } else if (ch === '\\') {
      piezas.push({ tipo: 'literal', texto: seccion[i + 1] ?? '' });
      i++;
    } else if (ch === '[') {
      const fin = seccion.indexOf(']', i);
      if (fin < 0) return undefined;
      const dentro = seccion.slice(i + 1, fin);
      // Un color se ignora: no cambia el texto. Una condición no se soporta.
      if (/^[<>=]/.test(dentro)) return undefined;
      i = fin;
    } else if (ch === '*' || ch === '_') {
      // Relleno y alineación: no se soportan, salvo `_x` (un espacio del ancho
      // de x), que se aproxima con un espacio.
      if (ch === '*') return undefined;
      piezas.push({ tipo: 'literal', texto: ' ' });
      i++;
    } else {
      piezas.push({ tipo: 'codigo', texto: ch });
    }
  }
  return piezas;
}

/** Parte el formato en secciones por `;`, sin romper literales entre comillas. */
function secciones(formato: string): string[] {
  const out: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < formato.length; i++) {
    const ch = formato[i] as string;
    if (ch === '\\' && !enComillas) {
      actual += ch + (formato[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') enComillas = !enComillas;
    if (ch === ';' && !enComillas) {
      out.push(actual);
      actual = '';
    } else {
      actual += ch;
    }
  }
  out.push(actual);
  return out;
}

/** Si una sección es de fecha u hora: tiene `d`, `m`, `a`, `y`, `h` o `s` fuera de literales. */
function esDeFecha(piezas: readonly Pieza[]): boolean {
  return piezas.some((p) => p.tipo === 'codigo' && /[dmayhsDMAYHS]/.test(p.texto));
}

// --- Números ---------------------------------------------------------------

/** Redondeo a `d` decimales, alejándose de cero en el empate, como Excel. */
function redondear(x: number, d: number): number {
  const factor = 10 ** d;
  const r = Math.round(Math.abs(x) * factor + 1e-9) / factor;
  return x < 0 ? -r : r;
}

function conMiles(digitos: string, sep: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Da formato a un número con una sección numérica. El signo lo pone quien
 * llama: aquí llega siempre el valor absoluto cuando la sección es la de los
 * negativos.
 */
function formatearNumero(x: number, piezas: readonly Pieza[], r: ConfiguracionRegional): string | undefined {
  const codigos = piezas.filter((p) => p.tipo === 'codigo').map((p) => p.texto).join('');
  if (/[?/]/.test(codigos) && /\//.test(codigos)) return undefined; // fracciones: no

  // Porcentaje: cada % multiplica por cien.
  const porcientos = (codigos.match(/%/g) ?? []).length;
  let valor = x * 100 ** porcientos;

  // Posición del decimal y de la notación científica, en la secuencia de piezas.
  const iDecimal = piezas.findIndex((p) => p.tipo === 'codigo' && p.texto === r.decimal);
  const iExp = piezas.findIndex((p, i) => p.tipo === 'codigo' && /[eE]/.test(p.texto) && /[+-]/.test(piezas[i + 1]?.texto ?? ''));
  const finMantisa = iExp >= 0 ? iExp : piezas.length;

  const esMarcador = (p: Pieza | undefined) => p?.tipo === 'codigo' && /[0#?]/.test(p.texto);
  const finEntera = iDecimal >= 0 ? iDecimal : finMantisa;
  const marcadoresEnteros = piezas.slice(0, finEntera).filter(esMarcador);
  const marcadoresDecimales = iDecimal >= 0 ? piezas.slice(iDecimal + 1, finMantisa).filter(esMarcador) : [];

  // El separador de miles: entre marcadores enteros agrupa; **después del
  // último marcador de todos** escala, cada uno entre mil. Ese último marcador
  // puede ser decimal: en `"0,0.."` los dos puntos van tras los decimales y
  // dividen entre un millón. La primera versión solo los buscaba en la parte
  // entera, y lo cazó su test.
  const ultimoMarcador = piezas.slice(0, finMantisa).map(esMarcador).lastIndexOf(true);
  let escalas = 0;
  let agrupar = false;
  piezas.slice(0, finMantisa).forEach((p, i) => {
    if (p.tipo !== 'codigo' || p.texto !== r.miles) return;
    if (i > ultimoMarcador) escalas++;
    else if (i < finEntera && piezas.slice(0, i).some(esMarcador)) agrupar = true;
  });
  valor /= 1000 ** escalas;

  // Notación científica.
  let exponente = 0;
  let digitosExp = 0;
  let signoExp = '';
  if (iExp >= 0) {
    signoExp = piezas[iExp + 1]?.texto ?? '+';
    digitosExp = piezas.slice(iExp + 2).filter(esMarcador).length;
    if (valor !== 0) {
      const enteros = Math.max(1, marcadoresEnteros.length);
      exponente = Math.floor(Math.log10(Math.abs(valor))) - (enteros - 1);
      valor /= 10 ** exponente;
    }
  }

  const decimales = marcadoresDecimales.length;
  const redondeado = redondear(Math.abs(valor), decimales);
  const [parteEntera, parteDecimal = ''] = redondeado.toFixed(decimales).split('.');

  // Parte entera: los ceros forzados rellenan por la izquierda; los # no.
  const forzadosEnteros = marcadoresEnteros.filter((p) => p.texto === '0').length;
  let entera = parteEntera === '0' && forzadosEnteros === 0 ? '' : (parteEntera as string);
  entera = entera.padStart(forzadosEnteros, '0');
  if (agrupar) entera = conMiles(entera, r.miles);

  // Parte decimal: los # finales no enseñan ceros; los 0 sí; los ? ponen espacio.
  let decimal = parteDecimal;
  for (let k = marcadoresDecimales.length - 1; k >= 0; k--) {
    const m = (marcadoresDecimales[k] as Pieza).texto;
    if (decimal[k] !== '0' || m === '0') break;
    decimal = decimal.slice(0, k) + (m === '?' ? ' ' : '') + decimal.slice(k + 1);
  }

  // Montaje: los literales se respetan en su sitio; la parte entera va donde
  // está el primer marcador entero, la decimal tras el separador.
  let out = '';
  let enteraPuesta = false;
  let decimalPuesta = false;
  for (let i = 0; i < piezas.length; i++) {
    const p = piezas[i] as Pieza;
    if (p.tipo === 'literal') {
      out += p.texto;
      continue;
    }
    if (i === iExp) {
      const e = Math.abs(exponente).toString().padStart(digitosExp, '0');
      out += `E${exponente < 0 ? '-' : signoExp === '+' ? '+' : ''}${e}`;
      i = piezas.length; // el exponente cierra la sección
      continue;
    }
    if (/[0#?]/.test(p.texto)) {
      if (i < finEntera) {
        if (!enteraPuesta) {
          out += entera;
          enteraPuesta = true;
        }
      } else if (!decimalPuesta) {
        out += decimal;
        decimalPuesta = true;
      }
      continue;
    }
    if (i === iDecimal) {
      // Sin decimales que enseñar y todos opcionales, Excel deja la coma igual.
      out += r.decimal;
      continue;
    }
    if (p.texto === r.miles) continue; // ya aplicado como agrupación o escala
    if (p.texto === '%') {
      out += '%';
      continue;
    }
    // Una letra que no es el exponente invalida el formato (T5-023). El resto
    // de caracteres sueltos se escribe tal cual: `€`, `-`, `(`, espacio…
    if (/\p{L}/u.test(p.texto)) return undefined;
    out += p.texto;
  }
  return out;
}

// --- Fechas y horas ------------------------------------------------------------

/**
 * Agrupa los códigos de fecha en fichas (`dd`, `mmmm`, `aaaa`, `AM/PM`…) y
 * decide si cada `m` es mes o minuto: es minuto si viene después de una hora o
 * antes de unos segundos, como en Excel.
 */
function formatearFecha(serie: number, piezas: readonly Pieza[], r: ConfiguracionRegional): string | undefined {
  if (serie < 0) return undefined;
  const p = partesDeSerie(Math.floor(serie));
  if (typeof p === 'string') return undefined;

  let segundosDelDia = Math.round((serie - Math.floor(serie)) * 86400);
  if (segundosDelDia >= 86400) segundosDelDia = 86399;
  const horas = Math.floor(segundosDelDia / 3600);
  const minutos = Math.floor((segundosDelDia % 3600) / 60);
  const segundos = segundosDelDia % 60;
  const domingoCero = ((Math.floor(serie) % 7) + 7) % 7;
  const diaSemana = domingoCero === 0 ? 6 : domingoCero - 1; // 0 = domingo

  // Juntar códigos iguales consecutivos en fichas.
  type Ficha = { tipo: 'literal'; texto: string } | { tipo: 'codigo'; texto: string };
  const fichas: Ficha[] = [];
  const texto = piezas.map((x) => (x.tipo === 'codigo' ? x.texto : `\u0000${x.texto}\u0001`)).join('');
  for (let i = 0; i < texto.length; ) {
    const ch = texto[i] as string;
    if (ch === '\u0000') {
      const fin = texto.indexOf('\u0001', i);
      fichas.push({ tipo: 'literal', texto: texto.slice(i + 1, fin) });
      i = fin + 1;
      continue;
    }
    if (/^(AM\/PM|A\/P)/i.test(texto.slice(i))) {
      const m = /^(AM\/PM|A\/P)/i.exec(texto.slice(i)) as RegExpExecArray;
      fichas.push({ tipo: 'codigo', texto: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const bajo = ch.toLowerCase();
    if ('dmayhs'.includes(bajo)) {
      let j = i;
      while (j < texto.length && (texto[j] as string).toLowerCase() === bajo) j++;
      const largo = j - i;
      // `a` y `aa` no son ningún código: se escriben tal cual, con su
      // mayúscula. Solo `aaa` y `aaaa` son el día de la semana.
      if (bajo === 'a' && largo < 3) fichas.push({ tipo: 'literal', texto: texto.slice(i, j) });
      else fichas.push({ tipo: 'codigo', texto: bajo.repeat(largo) });
      i = j;
      continue;
    }
    // Una letra que no es ningún código invalida el formato entero, como
    // `"Estándar"` en el caso T5-023. Escribirla tal cual daría un texto que
    // parece bueno.
    if (/\p{L}/u.test(ch)) return undefined;
    fichas.push({ tipo: 'literal', texto: ch });
    i++;
  }

  const doceHoras = fichas.some((f) => f.tipo === 'codigo' && f.texto.startsWith('A'));
  const idioma = lengua(r);
  const dos = (x: number) => x.toString().padStart(2, '0');

  let out = '';
  fichas.forEach((f, i) => {
    if (f.tipo === 'literal') {
      out += f.texto;
      return;
    }
    const c = f.texto;
    if (c[0] === 'm') {
      const previo = fichas.slice(0, i).reverse().find((x) => x.tipo === 'codigo');
      const siguiente = fichas.slice(i + 1).find((x) => x.tipo === 'codigo');
      const esMinuto = c.length <= 2 && (previo?.texto[0] === 'h' || siguiente?.texto[0] === 's');
      if (esMinuto) {
        out += c.length === 1 ? String(minutos) : dos(minutos);
        return;
      }
      const nombre = (MESES[idioma] as string[])[p.mes - 1] as string;
      out += c.length === 1 ? String(p.mes)
        : c.length === 2 ? dos(p.mes)
        : c.length === 3 ? nombre.slice(0, 3)
        : c.length === 5 ? nombre.slice(0, 1)
        : nombre;
      return;
    }
    switch (c[0]) {
      case 'd': {
        const nombre = (DIAS[idioma] as string[])[diaSemana] as string;
        out += c.length === 1 ? String(p.dia) : c.length === 2 ? dos(p.dia) : c.length === 3 ? nombre.slice(0, 3) : nombre;
        return;
      }
      case 'a': {
        // Solo llegan aquí `aaa` y `aaaa`: el nombre del día, corto o entero.
        const nombre = (DIAS[idioma] as string[])[diaSemana] as string;
        out += c.length === 3 ? nombre.slice(0, 3) : nombre;
        return;
      }
      case 'y':
        out += c.length <= 2 ? dos(p.anio % 100) : String(p.anio);
        return;
      case 'h': {
        const h = doceHoras ? ((horas + 11) % 12) + 1 : horas;
        out += c.length === 1 ? String(h) : dos(h);
        return;
      }
      case 's':
        out += c.length === 1 ? String(segundos) : dos(segundos);
        return;
      case 'A': {
        const [am, pm] = MERIDIANO[idioma] as [string, string];
        out += c === 'AM/PM' ? (horas < 12 ? am : pm) : horas < 12 ? 'A' : 'P';
        return;
      }
    }
  });
  return out;
}

// --- La función ---------------------------------------------------------------

function darFormato(valor: ValorEscalar, formato: string, r: ConfiguracionRegional): ValorEscalar {
  const secs = secciones(formato);

  if (valor.tipo === TEXTO) {
    // Un texto solo cambia si hay cuarta sección, y entonces @ es el texto.
    const cuarta = secs[3];
    return { tipo: TEXTO, texto: cuarta === undefined ? valor.texto : cuarta.replace(/@/g, valor.texto).replace(/"/g, '') };
  }

  const x = valor.tipo === NUMERO || valor.tipo === LOGICO ? valor.numero : 0;
  // Solo "General": "Estándar", que es como se llama en el menú en español,
  // es #¡VALOR! dentro de TEXTO (caso T5-023).
  if (formato === '' || /^general$/i.test(formato)) {
    return { tipo: TEXTO, texto: coercionTexto({ forma: 'constante', n: 1, valor: { tipo: NUMERO, numero: x } }, 0) };
  }

  // Qué sección se usa, y si el signo lo pone la sección o hay que ponerlo.
  let seccion = secs[0] as string;
  let signo = x < 0 ? '-' : '';
  let absoluto = x;
  if (x < 0 && secs.length >= 2) {
    seccion = secs[1] as string;
    signo = '';
    absoluto = -x;
  } else if (x === 0 && secs.length >= 3) {
    seccion = secs[2] as string;
  } else if (x < 0) {
    absoluto = -x;
  }

  const piezas = trocear(seccion);
  if (!piezas) return { tipo: ERROR, error: '#VALUE!' };

  const texto = esDeFecha(piezas) ? formatearFecha(x, piezas, r) : formatearNumero(absoluto, piezas, r);
  if (texto === undefined) return { tipo: ERROR, error: '#VALUE!' };

  // Un negativo que redondea a cero no lleva signo: TEXTO(-0,001;"0") es "0".
  const esCeroVisible = !/[1-9]/.test(texto);
  return { tipo: TEXTO, texto: (esCeroVisible ? '' : signo) + texto };
}

export function TEXT(args: Argumento[], n: number): Columna {
  const cValor = args[0]?.columnas[0];
  const cFormato = args[1]?.columnas[0];
  if (!cValor || !cFormato) return desdeEscalar({ tipo: ERROR, error: '#VALUE!' }, n);

  const r = regionalActual();
  const calcular = (i: number): ValorEscalar => {
    const tv = tipoEn(cValor, i);
    if (tv === ERROR) return { tipo: ERROR, error: errorEn(cValor, i) ?? '#VALUE!' };
    if (tipoEn(cFormato, i) === ERROR) return { tipo: ERROR, error: errorEn(cFormato, i) ?? '#VALUE!' };
    const formato = coercionTexto(cFormato, i);
    const valor: ValorEscalar =
      tv === TEXTO ? { tipo: TEXTO, texto: textoEn(cValor, i) ?? '' }
      : tv === VACIO ? { tipo: NUMERO, numero: 0 }
      : { tipo: NUMERO, numero: numeroEn(cValor, i) };
    return darFormato(valor, formato, r);
  };

  if (esInvariante(cValor) && esInvariante(cFormato)) return desdeEscalar(calcular(0), n);
  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) salida.ponerValor(i, calcular(i));
  return salida.terminar();
}

