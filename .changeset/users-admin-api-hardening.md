---
'@bilbomd/backend': minor
'@bilbomd/bilbomd-types': minor
---

Harden the admin users API. `GET /users` and `GET /users/:id` now return an explicit allowlist of fields instead of the raw user document, so refresh tokens, API token hashes, OTP and confirmation codes, and OAuth ids never leave the server. The response also gains the read-only fields the admin UI needs: `status`, `lastAccess`, `jobCount`, `oauthProviders`, and `emailNotifications`. `PATCH /users` refuses to let an Admin or Manager deactivate their own account or drop their own admin role, and `last_access` is now recorded on login and token refresh.
