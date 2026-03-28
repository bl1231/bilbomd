---
'@bilbomd/ui': minor
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/md-utils': patch
---

Upgrade major npm dependencies: TypeScript 6.0, Vite 8, @vitejs/plugin-react 6, jsdom 29, @types/supertest 7.

- Update `vite.config.ts` to use `rolldownOptions` (renamed from `rollupOptions` in Vite 8)
- Fix `vi.mock` factory JSX hoisting incompatibility introduced by @vitejs/plugin-react 6
- Update eslint-config peer dependency to accept TypeScript 5 or 6
