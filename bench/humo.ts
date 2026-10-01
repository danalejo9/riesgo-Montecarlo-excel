/// <reference lib="dom" />
/**
 * Prueba de humo del panel: lo abre de verdad en un navegador, sobre el banco
 * (el Excel de mentira de `ui/banco/`), recorre las pestañas, simula el
 * modelo de costos, crea un ejemplo de cronograma, lo simula y comprueba que
 * el plan de `RIESGO.CRONOGRAMA` se guarda en el libro y se recupera. Falla
 * si la página da cualquier error.
 *
 * Existe porque el 30/09 un import roto (un nombre pedido al módulo
 * equivocado) pasó la compilación y las pruebas y solo lo vio el navegador.
 *
 *     npm run humo
 *
 * Necesita Playwright con Chromium. Si no está instalado, avisa y no falla,
 * salvo con `HUMO_OBLIGATORIO=1` (para la integración continua).
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { createServer } from 'vite';

type Navegador = {
  newPage(o?: object): Promise<Pagina>;
  close(): Promise<void>;
};
type Localizador = {
  click(o?: object): Promise<void>;
  first(): Localizador;
  waitFor(o?: object): Promise<void>;
  isVisible(): Promise<boolean>;
  selectOption(v: string): Promise<unknown>;
  innerText(): Promise<string>;
};
type Pagina = {
  on(evento: string, f: (x: { type?: () => string; text?: () => string; toString(): string }) => void): void;
  goto(url: string): Promise<unknown>;
  getByRole(rol: string, o: object): Localizador;
  getByText(t: string | RegExp, o?: object): Localizador;
  locator(s: string): Localizador;
  evaluate<T>(f: () => T | Promise<T>): Promise<T>;
  waitForFunction(f: () => unknown, a?: unknown, o?: object): Promise<unknown>;
};

const obligatorio = process.env.HUMO_OBLIGATORIO === '1';

/** Playwright del proyecto, o el instalado globalmente. */
async function cargarPlaywright(): Promise<{ chromium: { launch(o?: object): Promise<Navegador> } } | null> {
  try {
    return (await import('playwright' as string)) as never;
  } catch {
    try {
      const global = execSync('npm root -g', { encoding: 'utf8' }).trim();
      return createRequire(join(global, 'noop.js'))('playwright');
    } catch {
      return null;
    }
  }
}

const pw = await cargarPlaywright();
if (!pw) {
  const m = 'Prueba de humo OMITIDA: falta Playwright (npm i -D playwright && npx playwright install chromium).';
  console.warn(`\n⚠  ${m}\n`);
  process.exit(obligatorio ? 1 : 0);
}

const servidor = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await servidor.listen();
const base = servidor.resolvedUrls?.local[0] ?? 'http://localhost:9090/';
const navegador = await pw.chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : {});
const errores: string[] = [];
const pasos: string[] = [];
const paso = (t: string) => {
  pasos.push(t);
  console.log(`  · ${t}`);
};

try {
  const p = await navegador.newPage({ viewport: { width: 420, height: 1400 }, ignoreHTTPSErrors: true });
  p.on('pageerror', (e) => errores.push(`Error de página: ${String(e)}`));
  p.on('console', (m) => {
    if (m.type?.() === 'error') errores.push(`Consola: ${m.text?.()}`);
  });
  await p.goto(new URL('banco/', base).href);
  await p.getByRole('button', { name: 'Modelo', exact: true }).first().waitFor({ timeout: 60_000 });
  paso('el banco carga');

  for (const pestana of ['Resultados', 'Cronograma', 'Diagnóstico', 'Modelo']) {
    await p.getByRole('button', { name: pestana, exact: true }).first().click();
    await p.getByText(pestana === 'Modelo' ? 'Simular' : pestana, { exact: false }).first().waitFor({ timeout: 10_000 });
  }
  paso('las pestañas se abren');

  // El modelo de costos del banco, simulado.
  await p.getByRole('button', { name: 'Simular', exact: true }).first().click();
  await p.waitForFunction(() => !document.body.innerText.includes('Simulando'), undefined, { timeout: 120_000 });
  paso('el modelo de costos simula');

  // Un ejemplo de cronograma: se escribe, se calcula y se simula.
  await p.getByRole('button', { name: 'Cronograma', exact: true }).first().click();
  await p.getByRole('button', { name: 'Crear ejemplo', exact: true }).click();
  await p.getByText('días laborables', { exact: false }).first().waitFor({ timeout: 30_000 });
  paso('el ejemplo de vivienda se escribe y se calcula');
  await p.getByRole('button', { name: 'Simular el plazo', exact: true }).click();
  await p.waitForFunction(() => /P80/.test(document.body.innerText) && !/Simulando…/.test(document.body.innerText), undefined, { timeout: 120_000 });
  paso('el plazo simula');

  // El plan de RIESGO.CRONOGRAMA, en el libro, y recuperado «en otro equipo».
  const recuperado = await p.evaluate(async () => {
    const g = globalThis as unknown as { __ajustesLibro: Map<string, string>; __restaurarPlan: () => Promise<boolean>; __riesgoPlanCronograma?: unknown };
    const guardado = g.__ajustesLibro.has('riesgoMontecarlo.planCronograma.v1');
    delete g.__riesgoPlanCronograma;
    try {
      localStorage.removeItem('riesgoMontecarlo.planCronograma.v1');
    } catch {
      /* sin almacén */
    }
    const restaurado = await g.__restaurarPlan();
    return guardado && restaurado && g.__riesgoPlanCronograma !== undefined;
  });
  if (!recuperado) errores.push('El plan del cronograma no se guardó en el libro o no se recuperó de él.');
  else paso('el plan del cronograma se guarda en el libro y se recupera');

  const avisosDeError = await p.locator('.error').isVisible().catch(() => false);
  if (avisosDeError) errores.push(`El panel enseña un error: ${await p.locator('.error').first().innerText()}`);
} catch (e) {
  errores.push(`La prueba no pudo seguir: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await navegador.close();
  await servidor.close();
}

if (errores.length > 0) {
  console.error(`\n✗ Prueba de humo: ${errores.length} problema(s) tras ${pasos.length} paso(s) bien:`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\n✓ Prueba de humo: ${pasos.length} pasos sin errores.`);
process.exit(0);
