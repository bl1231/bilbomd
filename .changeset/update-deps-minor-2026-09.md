---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
'@bilbomd/ui': patch
'@bilbomd/md-utils': patch
'@bilbomd/mongodb-schema': patch
---

Update npm dependencies to their latest minor and patch releases, including mongoose 9.10, MUI 9.4, React 19.3, react-router 8.4, vite 8.3, axios 1.20 and bull-board 9.10. jsdom stays on 30.0.x because vitest 4 can't handle jsdom 30.1's `FormData` internals.
