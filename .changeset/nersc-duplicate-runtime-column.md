---
'@bilbomd/ui': patch
---

Remove the duplicate "Runtime" column from the Jobs table on NERSC. It sat next to the Slurm-based "Run Time" column and was always empty there, because NERSC jobs have no job-level start time.
