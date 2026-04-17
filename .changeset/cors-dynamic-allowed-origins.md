---
'@bilbomd/backend': patch
---

CORS allowed origins are now derived at runtime from `BILBOMD_URL` and `BILBOMD_UI_PORT`, fixing CORS errors for external users installing BilboMD on their own hardware. An optional `CORS_ALLOWED_ORIGINS` env var (comma-separated) is also supported for additional origins.
