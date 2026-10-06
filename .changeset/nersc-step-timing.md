---
'@bilbomd/worker': minor
---

Show step timing for NERSC jobs. The generated Slurm script now records when each step starts and finishes in `status.txt`, and the job monitor copies those times into the job, so the job page shows how long each step took, as it does for beamline jobs. The copy-results, results and email steps are timed as well, and the NERSC job step shows how long the Slurm job ran.
