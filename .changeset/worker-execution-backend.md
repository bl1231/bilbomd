---
'@bilbomd/worker': minor
---

Add `EXECUTION_BACKEND` (`local` or `nersc`) to choose where the worker runs pipelines; `USE_NERSC` still works when it is unset. The NERSC environment variables are now only required for the `nersc` backend. Add an `ENABLE_MOVIES` switch (default on) and a `run-job` entrypoint (`node dist/run-job.js <bilbomd|multimd> <bullmq-job-id>`) that runs one queued job in its own process and exits, the pod side of the upcoming Kubernetes backend.
