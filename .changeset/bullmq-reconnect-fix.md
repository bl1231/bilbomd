---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Workers now start taking jobs again after Redis restarts. With bullmq 6.1.1, an idle worker never resumed after any Redis outage, even one of 10 seconds. It logged no errors but stopped picking up jobs until its container was restarted. Upgrading to bullmq 6.3.9 fixes this (taskforcesh/bullmq#4586). The worker's BilboMD, movie and MultiMD workers and the backend's delete worker now log Redis errors instead of printing raw stack traces.
