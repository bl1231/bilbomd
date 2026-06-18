---
'@bilbomd/backend': minor
'@bilbomd/ui': patch
---

Add cryptographically signed license-file validation. Job submission now
requires a valid RS256-signed BilboMD license token, provided via
`BILBOMD_LICENSE_KEY` or a file at `BILBOMD_LICENSE_FILE` (default
`/app/license.jwt`). The backend ships only the public verification key; tokens
are minted offline with the licensor tooling in
`apps/backend/scripts/license/`. Licensee/expiry status is surfaced to the UI as
a banner, and job-creating endpoints return HTTP 403 when no valid license is
installed.
