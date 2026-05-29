import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  // Files + global env
  { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
  { languageOptions: { globals: globals.browser } },

  // Base JS + TS (non type-aware)
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  // Ignore build artifacts
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

  // Project-aware TS settings (limit scope to src to reduce noise)
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-refresh': reactRefresh,
      'react-hooks': pluginReactHooks
    },
    rules: {
      'react-refresh/only-export-components': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TS hygiene
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],

      // A couple of useful type-aware checks
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: false }
      ]
    }
  }
])
