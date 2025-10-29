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
    // Package-specific overrides (if needed)
    rules: {
      // Since this is a Node.js package, disable React rules
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off'
    }
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
