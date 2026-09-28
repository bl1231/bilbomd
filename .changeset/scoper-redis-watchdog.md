---
'@bilbomd/scoper': patch
---

The SCOPER worker now exits if its Redis errors continue for 2 minutes without a 60-second break, so Docker restarts it with a fresh connection. Before this, a worker that lost Redis, for example when epyc's Redis restarted, could keep logging `ECONNREFUSED` indefinitely while the UI reported that no SCOPER worker was running. Worker errors are now logged through the scoper logger instead of printed as raw stack traces.
