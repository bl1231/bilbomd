---
'@bilbomd/worker': patch
---

Retry MongoDB connections indefinitely with capped exponential backoff instead of giving up after 5 attempts. Previously, a MongoDB outage longer than ~25 seconds at worker startup exhausted the retry budget and the resulting unhandled rejection killed the worker process. The worker now keeps retrying (5s doubling to a 60s cap) and connects as soon as MongoDB is reachable, matching the backend's connection behavior.
