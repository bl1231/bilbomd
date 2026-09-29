---
'@bilbomd/worker': patch
---

Read NERSC Slurm (sacct) start and end times as Perlmutter's Pacific local time instead of UTC. They were stored 7–8 hours early, so the Jobs table showed "Invalid" queue times and run times hours too long for NERSC jobs.
