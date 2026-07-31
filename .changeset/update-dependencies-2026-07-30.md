---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
'@bilbomd/md-utils': patch
'@bilbomd/mongodb-schema': patch
---

Update dependencies to their latest compatible versions (bullmq 5.81.3, ioredis 5.11.1, mongoose 9.8.1, axios 1.19.0, @bull-board 8.4.0, @mui/x-data-grid 9.10.1, molstar 5.11.0, react 19.2.8, react-router 8.3.0, recharts 3.10.1, vite 8.1.5, eslint 10.8.0, typescript-eslint 8.65.0, prettier 3.9.6, turbo 2.10.7, and others).

Major upgrades: connect-redis 10 (only breaking change is dropping Node 18/20 support; the store API is unchanged), jsdom 30 and @testing-library/jest-dom 7 (both test-only).

ioredis is pinned to exact 5.11.1 to match the exact version required by bullmq 5.81.3. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).

Removed react-dropzone from @bilbomd/ui — it was declared but never imported anywhere in the source or the built bundle.

Fixed the HeaderBox style assertion: jsdom 30 resolves `rem` to absolute px in `getComputedStyle` (jsdom 29 did not), so the expected padding is now `16px 8px` rather than `16px 0.5rem`.
