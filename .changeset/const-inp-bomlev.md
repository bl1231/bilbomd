---
'@bilbomd/worker': patch
---

CHARMM heat and dynamics now read the uploaded constraint file at `bomlev 0` and restore `bomlev -2` afterwards. A bad constraint command now fails the job, instead of being skipped with a warning and silently leaving its fixed or rigid body out of the run. Applies to the local templates and to the NERSC Slurm templates.
