---
'@bilbomd/bilbomd-types': minor
'@bilbomd/worker': minor
'@bilbomd/backend': minor
---

Deleting a job now stops it. The backend's delete worker removes any not-yet-started BullMQ entries for the job and publishes a cancel message on `JOB_CANCEL_CHANNEL`; the worker running it aborts the job's AbortSignal, which kills its current external process (TERM, then KILL) and makes any further tool calls fail immediately. Cancelled jobs fail with an `UnrecoverableError`, so BullMQ doesn't retry them, and deleting a job also cancels its movie renders.

In the worker, each job runs in an `AsyncLocalStorage` context holding its signal and `runProcess` uses it by default, so no pipeline or step signatures change. BullMQ's own processor signal is honoured too. NERSC (Slurm) jobs and running SCOPER jobs are not cancelled yet.
