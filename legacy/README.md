# Codigo heredado — congelado

Esto es el complemento tal como lo dejo la IA anterior. **No se corrige, no se
mantiene y no entra en el build, el lint ni los tests.** Se conserva aqui como
referencia mientras se reescribe el producto; cuando deje de ser util, se borra
(el commit etiquetado `v0.0.0-heredado` lo conserva para siempre).

Por que esta aqui y no parcheado (ver `docs/FASE1_AUDITORIA_TECNICA.md`):

- No compila: 10 errores de tipos y 55 de ESLint.
- Las funciones `=RIESGO.*` nunca llegaron a registrarse en Excel.
- El motor recalcula el libro entero en cada iteracion: ~3 h para 1M.
- Cero tests.

Sirve para dos cosas concretas:

1. **Referencia de comportamiento.** El flujo de la UI (definir entradas ->
   salidas -> simular -> resultados -> exportar) es correcto y se reutiliza.
2. **Piezas reaprovechables** listadas en el §10 de la auditoria: CDFs teoricas,
   muestreadores correctos (normal, uniforme, triangular, Bernoulli) y
   `exportReportToExcel`. Se portan **con tests**, nunca copiando y pegando.

Ojo con lo que NO se debe reutilizar: PERT (varianza incorrecta), lognormal
(parametrizacion ambigua), Poisson y Binomial (algoritmos O(n) que pueden
colgarse), y todo `runMonteCarloSimulation`.
