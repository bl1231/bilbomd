---
'@bilbomd/worker': patch
---

Fix NERSC jobs staying Pending in BilboMD after Slurm ran them. The job monitor now asks Slurm for job state directly (`cached=false`) instead of the Superfacility API's cached job database, which was returning no data for our jobs.
