---
'@bilbomd/worker': patch
---

Fix the PAE step staying "Running" on NERSC OpenMM jobs after it finished. The generated Slurm script now marks the PAE step as Success, or as Error if constraint generation fails.
