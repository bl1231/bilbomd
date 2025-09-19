import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default defineConfig([
  // Ignore build artifacts & coverage
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'openapi/**',
      'test/**',
      'vitest.config.*',
      'vite.config.*',
      'eslint.config.*',
      'tsup.config.*'
    ]
  },

  // Baseline TypeScript rules (no type info)
  ...tseslint.configs.recommended,

  // Type-aware rules for this package
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      },
      globals: globals.node
    },
    rules: {
      // add/override rules here if needed
    }
  }
])
