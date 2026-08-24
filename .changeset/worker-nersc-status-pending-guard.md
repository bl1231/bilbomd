---
'@bilbomd/worker': patch
---

Fix false "Failed to fetch NERSC job state" error shown briefly after Slurm submission. When the Superfacility API returns empty accounting data for a job whose stored state is still PENDING (sacct propagation lag), the monitor now reports a benign "Waiting for job to appear in Slurm accounting..." status instead of an Error step.
