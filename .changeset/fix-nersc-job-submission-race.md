---
'@bilbomd/worker': patch
---

Fix three related bugs in the NERSC job submission and monitoring path.

1. `makeBilboMDSlurm` was silently swallowing errors, allowing the pipeline to proceed to Slurm submission even when the batch file was never prepared.
2. `submitBilboMDSlurm` was not validating the NERSC-returned job ID, writing `nersc.jobid = null` to MongoDB and marking the BullMQ job as completed — causing jobs to appear permanently stuck.
3. The job monitor was calling `updateJobStepsFromSlurmStatusFile` for PENDING jobs, but `status.txt` does not exist until the Slurm job starts running, causing the monitor to mark healthy jobs as Error on every cycle.
