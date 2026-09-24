import { describe, expect, it } from 'vitest';

import { parsear, recorrer, type Nodo } from '../../engine/parser/index.ts';

function ast(formula: string): Nodo {
  const r = parsear(formula);
  if (!r.ok) throw new Error(`No parseó "${formula}": ${r.error.mensaje} (pos ${r.error.pos})`);
  return r.ast;
}

function error(formula: string): string {
  const r = parsear(formula);
  if (r.ok) throw new Error(`"${formula}" debería fallar y parseó`);
  return r.error.mensaje;
}

/** Reconstruye la fórmula en forma canónica para comparar estructuras. */
function texto(n: Nodo): string {
  switch (n.tipo) {
    case 'numero': return String(n.valor);
    case 'texto': return `"${n.valor}"`;
    case 'logico': return n.valor ? 'TRUE' : 'FALSE';
    case 'error': return n.valor;
    case 'celda': return `${n.ref.hoja ? `${n.ref.hoja}!` : ''}C${n.ref.col}R${n.ref.fila}`;
    case 'rango': {
      const r = n.ref;
      return `${r.hoja ? `${r.hoja}!` : ''}[${r.col1},${r.fila1}:${r.col2},${r.fila2}]`;
    }
    case 'nombre': return `@${n.nombre}`;
    case 'funcion': return `${n.nombre.toUpperCase()}(${n.args.map(texto).join(' ')})`;
    case 'unaria': return `(${n.op}${texto(n.arg)})`;
    case 'porcentaje': return `(${texto(n.arg)}%)`;
    case 'binaria': return `(${texto(n.izq)} ${n.op} ${texto(n.der)})`;
    case 'matriz': return `{${n.filas.map((f) => f.map(texto).join(',')).join(';')}}`;
    case 'vacio': return '_';
    case 'no-soportado': return `!${n.motivo}`;
  }
}

describe('literales', () => {
  it('números en todas sus formas', () => {
    expect(texto(ast('=42'))).toBe('42');
    expect(texto(ast('=3.14'))).toBe('3.14');
    expect(texto(ast('=.5'))).toBe('0.5');
    expect(texto(ast('=1E3'))).toBe('1000');
    expect(texto(ast('=1.5e-3'))).toBe('0.0015');
  });

  it('texto, con comillas escapadas', () => {
    expect(texto(ast('="hola"'))).toBe('"hola"');
    expect(texto(ast('="dice ""hola"" y ya"'))).toBe('"dice "hola" y ya"');
    expect(texto(ast('=""'))).toBe('""');
  });

  it('booleanos y errores', () => {
    expect(texto(ast('=TRUE'))).toBe('TRUE');
    expect(texto(ast('=false'))).toBe('FALSE');
    expect(texto(ast('=#REF!'))).toBe('#REF!');
    expect(texto(ast('=#DIV/0!'))).toBe('#DIV/0!');
    expect(texto(ast('=IFERROR(A1,#N/A)'))).toBe('IFERROR(C1R1 #N/A)');
  });

  it('acepta la fórmula con y sin el = inicial', () => {
    expect(texto(ast('SUM(A1)'))).toBe(texto(ast('=SUM(A1)')));
  });
});

describe('referencias', () => {
  it('celdas, con y sin dólares', () => {
    expect(texto(ast('=A1'))).toBe('C1R1');
    expect(texto(ast('=$A$1'))).toBe('C1R1');
    expect(texto(ast('=$B2'))).toBe('C2R2');
    expect(texto(ast('=XFD1048576'))).toBe('C16384R1048576');
  });

  it('rangos, normalizando el orden de los extremos', () => {
    expect(texto(ast('=A1:B5'))).toBe('[1,1:2,5]');
    expect(texto(ast('=B5:A1'))).toBe('[1,1:2,5]');
  });

  it('columnas y filas enteras', () => {
    expect(texto(ast('=A:A'))).toBe('[1,null:1,null]');
    expect(texto(ast('=A:C'))).toBe('[1,null:3,null]');
    expect(texto(ast('=3:7'))).toBe('[null,3:null,7]');
  });

  it('hojas, con y sin comillas', () => {
    expect(texto(ast('=Datos!A1'))).toBe('Datos!C1R1');
    expect(texto(ast("='Costes 2026'!A1:B2"))).toBe('Costes 2026![1,1:2,2]');
    expect(texto(ast("='Con''comilla'!A1"))).toBe("Con'comilla!C1R1");
  });

  it('nombres definidos', () => {
    expect(texto(ast('=TASA_IVA'))).toBe('@TASA_IVA');
    expect(texto(ast('=Base*TASA_IVA'))).toBe('(@Base * @TASA_IVA)');
  });

  it('rechaza referencias fuera de la hoja', () => {
    expect(error('=ZZZ1')).toMatch(/fuera de la hoja/);
  });
});

describe('precedencia', () => {
  it('multiplicación antes que suma', () => {
    expect(texto(ast('=1+2*3'))).toBe('(1 + (2 * 3))');
    expect(texto(ast('=(1+2)*3'))).toBe('((1 + 2) * 3)');
  });

  it('comparación es lo último', () => {
    expect(texto(ast('=1+2>3*4'))).toBe('((1 + 2) > (3 * 4))');
  });

  it('concatenación entre comparación y suma', () => {
    expect(texto(ast('=A1&B1="xy"'))).toBe('((C1R1 & C2R1) = "xy")');
  });

  it('la potencia asocia por la izquierda, como en Excel', () => {
    // Excel: 2^3^2 = 64, no 512. Es distinto de casi cualquier lenguaje.
    expect(texto(ast('=2^3^2'))).toBe('((2 ^ 3) ^ 2)');
  });

  it('el menos unario se aplica antes que la potencia', () => {
    // Excel: -2^2 = 4. Si el unario fuera más débil daría -4.
    expect(texto(ast('=-2^2'))).toBe('((-2) ^ 2)');
    expect(texto(ast('=--A1'))).toBe('(-(-C1R1))');
  });

  it('el porcentaje se pega al operando', () => {
    expect(texto(ast('=1+50%'))).toBe('(1 + (50%))');
    expect(texto(ast('=A1*20%'))).toBe('(C1R1 * (20%))');
  });

  it('el rango se resuelve antes que cualquier operador', () => {
    expect(texto(ast('=SUM(A1:B2)*2'))).toBe('(SUM([1,1:2,2]) * 2)');
  });

  it('los operadores de igual precedencia asocian por la izquierda', () => {
    expect(texto(ast('=10-3-2'))).toBe('((10 - 3) - 2)');
    expect(texto(ast('=100/10/2'))).toBe('((100 / 10) / 2)');
  });

  it('comparadores de dos caracteres', () => {
    expect(texto(ast('=A1<>B1'))).toBe('(C1R1 <> C2R1)');
    expect(texto(ast('=A1<=B1'))).toBe('(C1R1 <= C2R1)');
    expect(texto(ast('=A1>=B1'))).toBe('(C1R1 >= C2R1)');
  });
});

describe('identificadores con letras no ASCII', () => {
  // Un libro es-ES trae nombres definidos como `Año` y, si alguien pega una
  // fórmula localizada, funciones como `FRAC.AÑO`. Tratarlos como error de
  // sintaxis sería acusar al motor de un fallo que no es suyo: son un nombre
  // sin resolver y una función que no está, y el informe debe decir eso.
  it('un nombre definido con tilde o eñe', () => {
    expect(texto(ast('=Año*2'))).toBe('(@Año * 2)');
    expect(texto(ast('=Precio_Año_1+1'))).toBe('(@Precio_Año_1 + 1)');
  });

  it('una función localizada se reconoce como función, no como sintaxis rota', () => {
    const a = ast('=FRAC.AÑO(A1,A2)');
    expect(a.tipo).toBe('funcion');
    if (a.tipo === 'funcion') expect(a.nombre).toBe('FRAC.AÑO');
  });
});

describe('funciones', () => {
  it('sin argumentos, con uno y con varios', () => {
    expect(texto(ast('=NOW()'))).toBe('NOW()');
    expect(texto(ast('=SUM(A1)'))).toBe('SUM(C1R1)');
    expect(texto(ast('=ROUND(A1,2)'))).toBe('ROUND(C1R1 2)');
  });

  it('anidadas', () => {
    expect(texto(ast('=IF(A1>0,ROUND(B1*C1,2),0)')))
      .toBe('IF((C1R1 > 0) ROUND((C2R1 * C3R1) 2) 0)');
  });

  it('argumentos omitidos', () => {
    expect(texto(ast('=SUM(A1,,B1)'))).toBe('SUM(C1R1 _ C2R1)');
    expect(texto(ast('=IF(A1,1,)'))).toBe('IF(C1R1 1 _)');
    expect(texto(ast('=VLOOKUP(A1,B:C,2,)'))).toBe('VLOOKUP(C1R1 [2,null:3,null] 2 _)');
  });

  it('nombres con punto y con prefijo _xlfn', () => {
    expect(texto(ast('=STDEV.S(A1:A9)'))).toBe('STDEV.S([1,1:1,9])');
    expect(texto(ast('=_xlfn.XLOOKUP(A1,B:B,C:C)')))
      .toBe('_XLFN.XLOOKUP(C1R1 [2,null:2,null] [3,null:3,null])');
    expect(texto(ast('=RISK.PERT(800,950,1400)'))).toBe('RISK.PERT(800 950 1400)');
  });

  it('admite espacio entre el nombre y el paréntesis', () => {
    expect(texto(ast('=SUM (A1:A9)'))).toBe('SUM([1,1:1,9])');
  });

  it('detecta argumentos mal separados', () => {
    expect(error('=SUM(A1 B1)')).toMatch(/Se esperaba/);
  });
});

describe('constantes matriciales', () => {
  it('una fila y varias filas', () => {
    expect(texto(ast('={1,2,3}'))).toBe('{1,2,3}');
    expect(texto(ast('={1,2;3,4}'))).toBe('{1,2;3,4}');
  });

  it('rechaza filas de distinto tamaño', () => {
    expect(error('={1,2;3}')).toMatch(/distinto tamaño/);
  });
});

describe('construcciones fuera de alcance', () => {
  it('las marca sin romper el parseo', () => {
    // Importa que no sean errores de sintaxis: el informe debe poder decir
    // "esta celda usa una referencia externa", no "no se entiende".
    expect(texto(ast('=[1]Hoja1!A1'))).toBe('!Referencia a otro libro');
    expect(texto(ast("='[Libro.xlsx]Hoja'!A1"))).toBe('!Referencia a otro libro');
    expect(texto(ast('=SUM(Tabla1[Importe])'))).toBe('SUM(!Referencia estructurada de tabla)');
    expect(texto(ast('=(A1:A5,C1:C5)'))).toBe('!Unión de rangos');
  });

  it('el operador de derrame de matriz dinámica', () => {
    const n = ast('=SUM(A1#)');
    const motivos: string[] = [];
    recorrer(n, (x) => { if (x.tipo === 'no-soportado') motivos.push(x.motivo); });
    expect(motivos).toContain('Matriz dinámica (operador de derrame)');
  });
});

describe('errores de sintaxis', () => {
  it('dan mensaje y posición, sin lanzar excepción', () => {
    const r = parsear('=1+');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.mensaje).toMatch(/termina antes de tiempo/);
      expect(r.error.pos).toBeGreaterThan(0);
    }
  });

  it('paréntesis sin cerrar', () => {
    expect(error('=SUM(A1')).toMatch(/Se esperaba/);
  });

  it('operador sin operando izquierdo', () => {
    expect(error('=*3')).toMatch(/Falta un operando/);
  });

  it('texto sin cerrar', () => {
    expect(texto(ast('="sin cerrar'))).toBe('!Cadena de texto sin cerrar');
  });

  it('sobra contenido al final', () => {
    expect(error('=1 2')).toMatch(/Sobra/);
  });
});

describe('recorrer', () => {
  it('visita todos los nodos en preorden', () => {
    const tipos: string[] = [];
    recorrer(ast('=IF(A1>0,SUM(B1:B9),0)'), (n) => tipos.push(n.tipo));
    expect(tipos).toEqual([
      'funcion', 'binaria', 'celda', 'numero', 'funcion', 'rango', 'numero',
    ]);
  });
});
