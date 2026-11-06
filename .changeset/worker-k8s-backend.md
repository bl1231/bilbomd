---
'@bilbomd/worker': minor
---

Add the `k8s` execution backend. With `EXECUTION_BACKEND=k8s` the worker runs each BilboMD or Multi job as a Kubernetes Job in its own namespace (`node dist/run-job.js` in the worker image) and waits for it. BullMQ concurrency (`K8S_MAX_JOBS`) caps how many run at once, OpenMM jobs get a GPU through a ResourceClaimTemplate, cancelling a job deletes its Kubernetes Job, and a restarted worker adopts Jobs that are still running. Out-of-memory kills, deadlines, image pull errors and evictions fail the job with that reason. The Berkelium Helm chart gets a dispatcher Deployment and the `bilbomd-gpu` ResourceClaimTemplate.
