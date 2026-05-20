---
'@bilbomd/backend': minor
---

Production-readiness hardening for the ORCID OAuth login flow (PR 1 of issue #817).

- **Require ORCID env vars (no silent sandbox fallbacks).** `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_REDIRECT_URI`, `ORCID_ISSUER`, `ORCID_BASE_URL`, and `ORCID_PUBLIC_API_URL` are now read with `getEnvVar()` and validated at the top of `initOrcidClient()`. Startup fails fast if any is missing when `ORCID_AUTH_ENABLED=true`. The previous defaults that fell back to `https://sandbox.orcid.org` while `ORCID_ISSUER` defaulted to `https://orcid.org` could silently split a deployment across sandbox and production endpoints. The `.env.example` now lists a PRODUCTION block as the default and a commented SANDBOX block for dev/staging.
- **Redis-backed express-session store.** Sessions now persist in Redis via `connect-redis` (reusing the existing BullMQ `ioredis` connection) instead of the default in-memory store, so the `req.session.orcidProfile` bridge between `/orcid/callback` and `/orcid/finalize` survives backend restarts and works across replicas.
- **Redact tokens in logs.** Added a `redactTokens()` helper used by the ORCID callback and confirmation handlers so OAuth `access_token` / `refresh_token` / `id_token` values are no longer written to logs.
