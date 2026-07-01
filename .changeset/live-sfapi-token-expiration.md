---
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Show the Superfacility API token expiration live instead of from a hand-maintained value. The backend adds an authenticated `/sfapi/account/clients` endpoint that reads the configured client's `expiresAt` directly from NERSC, and the UI TokenExpirationChip now sources its date from that endpoint. The static `SFAPI_TOKEN_EXPIRES` config value (and the `sfapi.token_expires` Helm value / configmap entry) is removed, so the expiration display can no longer drift out of date.
