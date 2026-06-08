---
'@bilbomd/backend': patch
---

Skip the non-fatal Swagger JSON archival write in production. The hardened container runs with a read-only root filesystem, so the write always failed with EACCES and logged a warning on every startup. The in-memory OpenAPI spec served at runtime is unaffected; the snapshot is now only written outside production.
