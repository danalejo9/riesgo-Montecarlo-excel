/**
 * Lógica elemento a elemento (Nivel 0, subconjunto numérico).
 *
 * Excel representa TRUE/FALSE como 1/0 en el modelo numérico que usa este
 * registro (ver types.ts): cualquier valor distinto de cero es verdadero. Es
 * el mismo convenio que usa Excel al coaccionar un número a condición.
 */

import { nuevoBuffer, type Arg, type Buffer } from './types.ts';

const verdadero = (x: number) => x !== 0;

/**
 * `IF(condición, si_verdadero, [si_falso])`.
 *
 * Si se omite `si_falso`, Excel devuelve FALSE (0). Aquí `args[2]` puede no
 * existir (nodo `vacio` del parser se traduce en el compilador a un buffer de
 * ceros; hasta que eso exista, se trata la ausencia como cero explícitamente).
 */
export function IF(args: Arg[], n: number): Buffer {
  const cond = args[0] as Arg;
  const siVerdadero = args[1] as Arg;
  const siFalso = args[2];
  const out = nuevoBuffer(n);
  const bc = cond[0] as Buffer;
  const bv = siVerdadero[0] as Buffer;
  const bf = siFalso ? (siFalso[0] as Buffer) : null;

  for (let i = 0; i < n; i++) {
    out[i] = verdadero(bc[i] as number) ? (bv[i] as number) : bf ? (bf[i] as number) : 0;
  }
  return out;
}

export function AND(args: Arg[], n: number): Buffer {
  const out = nuevoBuffer(n);
  out.fill(1);
  for (const arg of args) {
    const b = arg[0] as Buffer;
    for (let i = 0; i < n; i++) if (!verdadero(b[i] as number)) out[i] = 0;
  }
  return out;
}

export function OR(args: Arg[], n: number): Buffer {
  const out = nuevoBuffer(n);
  for (const arg of args) {
    const b = arg[0] as Buffer;
    for (let i = 0; i < n; i++) if (verdadero(b[i] as number)) out[i] = 1;
  }
  return out;
}

export function NOT(args: Arg[], n: number): Buffer {
  const b = (args[0] as Arg)[0] as Buffer;
  const out = nuevoBuffer(n);
  for (let i = 0; i < n; i++) out[i] = verdadero(b[i] as number) ? 0 : 1;
  return out;
}

export function XOR(args: Arg[], n: number): Buffer {
  const out = nuevoBuffer(n);
  for (const arg of args) {
    const b = arg[0] as Buffer;
    for (let i = 0; i < n; i++) if (verdadero(b[i] as number)) out[i] = (out[i] as number) === 1 ? 0 : 1;
  }
  return out;
}
