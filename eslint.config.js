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
])
