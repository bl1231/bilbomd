---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Update dotenv to 18. Nothing we use changed: `import 'dotenv/config'` and `dotenv.config()` work the same. dotenv 18 removed `.env.vault` and `node -r dotenv/config` preloading, which BilboMD doesn't use.
