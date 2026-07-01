---
'@bilbomd/ui': patch
---

Remove vestigial `VITE_*` configuration that was never read at runtime. Deletes the unused `apps/ui/.env`, the dead `bilbomd-ui-config` ConfigMap and its `envFrom` mount in the UI deployment, and the stale `VITE_BILBOMD_BACKEND_PORT` type declaration. Runtime UI configuration (including the Superfacility token expiry) flows through the backend `/configs` endpoint, not these build-time variables.
