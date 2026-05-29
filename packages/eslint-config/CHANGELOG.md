# @bilbomd/eslint-config

## 1.0.3

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).

## 1.0.2

### Patch Changes

- ddce8b0: Upgrade ESLint peer dependency from v9 to v10.

## 1.0.1

### Patch Changes

- aa50314: Remove eslint-plugin-react and eslint-plugin-react-hooks from shared eslint-config. The shared config is only consumed by md-utils (a Node.js package), which immediately disabled all React rules anyway. React linting lives in apps/ui's own eslint config.
