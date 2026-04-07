import baseConfig from '@bilbomd/eslint-config'

export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {}
  },
  {
    // Config files don't need TypeScript project parsing
    files: ['*.config.ts', '*.config.js', '*.config.mjs'],
    languageOptions: {
      parserOptions: {
        project: false
      }
    }
  }
]
