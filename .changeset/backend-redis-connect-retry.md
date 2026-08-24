---
'@bilbomd/backend': patch
---

Retry Redis connections with capped backoff instead of crashing at startup. Previously a Redis outage during a rolling deploy (e.g. while the redis image pulls on NERSC Spin) caused an uncaught ECONNREFUSED that crash-looped the backend and stalled the Helm upgrade. Both the session client (redis) and BullMQ client (ioredis) now log connection errors and reconnect automatically, and the delete-jobs worker reuses the shared Redis connection instead of a hardcoded host.
