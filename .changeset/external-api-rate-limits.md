---
'@bilbomd/backend': minor
---

Rate-limit the external API per API token, with separate budgets: 20 job submissions and 300 status/results requests per 15 minutes. A looser per-IP limit (300 per 15 minutes) still applies before the token check. Previously all external API requests shared 10 per 15 minutes per IP.
