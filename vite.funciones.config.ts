import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Empaqueta `ui/funciones.ts` en **un solo archivo IIFE**, `dist/funciones.js`.
 * El motor de funciones personalizadas de Excel en Windows no es un
 * navegador: no carga módulos ni fragmentos, necesita todo en uno.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    // Sintaxis conservadora: el motor de funciones de Excel no es un navegador actual.
    target: 'es2017',
    lib: {
      entry: resolve(__dirname, 'ui/funciones.ts'),
      formats: ['iife'],
      name: 'FuncionesRiesgo',
      fileName: () => 'funciones.js',
    },
  },
});
