---
'@bilbomd/worker': patch
---

Log the underlying cause of fetch errors in handleError so failures like TimeoutError or ECONNREFUSED are visible in logs instead of just "fetch failed".
