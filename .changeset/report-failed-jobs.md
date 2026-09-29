---
'@bilbomd/worker': minor
'@bilbomd/scoper': patch
---

Report failed jobs: once BullMQ stops retrying a failed BilboMD or Multi job, the worker marks it Error, records a `job_failed` usage event (with the failing step and error), and emails the owner. Cancelled jobs record `job_cancelled` instead. NERSC Slurm failures now email the owner too, and the NERSC monitor records started/failed/cancelled events once per status change instead of on every pass. SCOPER records `job_failed` on its last attempt and no longer tries to email anonymous job owners. Failure emails use a "BilboMD Job Failed" subject.
