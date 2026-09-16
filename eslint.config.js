import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `legacy/` es el codigo heredado congelado: se conserva como referencia
  // (v0.0.0-heredado) y no se corrige. Ver legacy/README.md.
  globalIgnores(['dist', 'legacy']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Regla de oro de la arquitectura (Fase 2, §2): el motor no depende del
    // entorno. Ni de Node ni de Office. Asi puede correr en un Web Worker del
    // panel y testearse en Node sin Excel. Que lo vigile el linter y no la
    // buena voluntad.
    files: ['engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['node:*', 'fs', 'path', 'os', 'zlib', 'fflate'], message: 'engine/ no puede depender del entorno (ver Fase 2, §2).' },
          { group: ['../excel/*', '../ui/*', '../scanner/*'], message: 'engine/ no puede depender de las capas superiores.' },
        ],
      }],
    },
  },
])
