---
'@bilbomd/mongodb-schema': patch
'@bilbomd/backend': patch
'@bilbomd/scoper': patch
'@bilbomd/worker': patch
'@bilbomd/ui': patch
---

Refresh dependencies across the workspace to pick up recent bug fixes and minor improvements. No schema/API changes and no expected breaking changes.

- Backend/Worker/Scoper: `bullmq@5.66`, `mongoose@8.20.3`, `winston@3.19`, `cron@4.4`
- UI: `react@19.2.3`, `react-dom@19.2.3`, `@mui/x-data-grid@8.22`, `recharts@3.6`, `molstar@5.4.2`
- Tooling: `vite@7.3`, `@vitejs/plugin-react@5.1.2`, `vite-tsconfig-paths@6.0.1`, `jsdom@27.3`, `sass-embedded@1.96`, `eslint@9.39.2`, `@typescript-eslint@8.50`, `@types/node@25`
- Lint/tests: small cleanups to silence unused vars/imports in a few UI tests; no behavioral changes.
