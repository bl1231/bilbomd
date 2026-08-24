---
'@bilbomd/backend': patch
---

Retry MongoDB connections with capped exponential backoff instead of giving up after one failed attempt. Previously, if MongoDB was unreachable when the backend started (e.g. during a deploy or an NFS lock-recovery window), the backend stayed up but permanently wedged — every DB operation buffered and timed out until the pod was manually restarted. The backend now keeps retrying (5s doubling to a 60s cap) and recovers as soon as MongoDB is reachable, while /healthcheck continues to report 503 until connected.
