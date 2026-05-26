---
'@bilbomd/backend': patch
---

Fix Redis syntax error in session store by using the official redis@5 client for connect-redis.

connect-redis@9 expects the redis@5 client API (set with options object), but an ioredis client was being passed, causing ERR syntax error on every session write.
