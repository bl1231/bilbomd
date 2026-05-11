---
'@bilbomd/worker': patch
---

Fix OF3 pipeline timing out after 5 minutes due to undici's default headersTimeout. Switch callOf3Service from native fetch to axios, which does not impose a headers-level timeout separate from the overall request timeout.
