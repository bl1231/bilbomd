---
'@bilbomd/bilbomd-types': minor
'@bilbomd/worker': patch
'@bilbomd/scoper': minor
---

Publish job update events from the rest of the job lifecycle, so pages that rely on the event stream stay current for every job type. The NERSC job monitor publishes one event per job whose status, progress, steps or NERSC state changed during a monitoring pass, and none for jobs that didn't change. The multi pipeline publishes when it starts, saves progress, fails or completes. SCOPER publishes from its step, progress and results updates and when a job starts or completes. The throttled publisher moves into `@bilbomd/bilbomd-types` as `createJobEventNotifier`, shared by the worker and SCOPER, and the SCOPER image now builds that package.
