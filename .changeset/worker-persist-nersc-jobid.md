---
'@bilbomd/worker': patch
---

Fix NERSC JobID and Status not appearing in the Jobs table. The worker now
persists the `nersc` sub-document to MongoDB immediately after Slurm submission,
so the NERSC job monitor can track and display job status (#855).
