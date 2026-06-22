---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
'@bilbomd/ui': patch
'@bilbomd/md-utils': patch
'@bilbomd/mongodb-schema': patch
---

Update dependencies to latest: bullmq, mongoose, nodemailer, uuid, @bull-board/*, @mui/x-data-grid, react-router 8, and root tooling (@types/node 26, lint-staged). Pin ioredis to 5.10.1 to match the version bundled with bullmq and avoid duplicate-package type conflicts.
