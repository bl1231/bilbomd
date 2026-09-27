---
'@bilbomd/mongodb-schema': minor
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Record per-step timing. `IStepStatus` gains optional `started_at`, `completed_at` and `duration_ms`, stamped server-side (`$$NOW`) by the new `buildStepStatusUpdate()` pipeline builder whenever a step moves to Running / Success / Error. Parallel runs that share a step (e.g. per-Rg MD) keep the first start and the last finish. The worker and scoper `updateStepStatus`/`handleStepError` and the worker's FoXS progress updates now use it, so no call sites change. Existing jobs are unaffected; NERSC jobs, whose steps are rebuilt from the remote status file, are not timed yet.
