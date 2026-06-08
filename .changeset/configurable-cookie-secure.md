---
'@bilbomd/backend': patch
---

Add a `COOKIE_SECURE` environment variable to control the `Secure` attribute on auth and session cookies. Browsers silently drop `Secure` cookies over plain HTTP, which broke login, token refresh, and ORCID for installs accessed via `http://` (e.g. `http://localhost:3001` with no TLS-terminating proxy). The flag defaults to the previous behavior (`Secure` when `BILBOMD_ENV=production`); set `COOKIE_SECURE=false` to allow cookies over HTTP. This also unifies the secure-cookie logic across the refresh-token, session, and ORCID cookies, which previously read inconsistent env vars (`BILBOMD_ENV` vs `NODE_ENV`).
