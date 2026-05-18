---
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Add `ORCID_AUTH_ENABLED` feature flag (default `false`) that gates the ORCID OAuth login flow. When disabled, the backend does not register the `/api/v1/auth/orcid/*` routes and skips OIDC discovery on startup, and the UI `/login` page redirects to `/magicklink`. ORCID will stay disabled in production until the hardening work tracked in issue #817 is complete.
