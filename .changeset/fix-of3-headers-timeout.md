---
'@bilbomd/worker': patch
---

Fix OF3 and AlphaFold pipelines timing out after 5 minutes due to undici's default headersTimeout. Switch callOf3Service and callColabFoldService from native fetch to axios, which does not impose a headers-level timeout separate from the overall request timeout. Also adds BullMQ heartbeat to callColabFoldService to match the OF3 implementation.
