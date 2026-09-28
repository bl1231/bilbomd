---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Support Redis authentication. When `REDIS_PASSWORD` is set, the backend (queues, sessions, and the Bull Board admin view), worker, and SCOPER send it to Redis. When it's unset, clients connect without a password as before.
