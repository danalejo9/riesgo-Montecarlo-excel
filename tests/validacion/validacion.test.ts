/** W3: los casos de validación publicables pasan en cada `npm test` (ver `casos.ts`). */
import { describe, expect, it } from 'vitest';

import { todosLosCasos } from './casos.ts';

describe('casos de validación del cronograma (W3)', () => {
  it('todas las comprobaciones, dentro de su tolerancia', async () => {
    const casos = await todosLosCasos();
    const fallos = casos.flatMap((c) => c.comprobaciones.filter((x) => !x.ok).map((x) => `${c.id} ${x.magnitud}: esperado ${x.esperado}, obtenido ${x.obtenido}`));
    expect(fallos).toEqual([]);
    expect(casos.length).toBeGreaterThanOrEqual(13);
  }, 180_000);
});
