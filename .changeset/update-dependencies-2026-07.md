---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
'@bilbomd/md-utils': patch
'@bilbomd/mongodb-schema': patch
---

Update dependencies to their latest compatible versions (bullmq 5.79.3, mongoose 9.7.4, nodemailer 9.0.3, @bull-board 8.1.2, redis 6.1.0, MUI 9.2.0, @mui/x-data-grid 9.8.0, react-router 8.2.0, recharts 3.9.2, vite 8.1.4, vitest 4.1.10, eslint 10.6.0, typescript-eslint 8.63.0, prettier 3.9.5, turbo 2.10.4, and others).

ioredis is pinned to 5.10.1 to match the exact version required by bullmq. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).
