---
'@bilbomd/worker': patch
---

NERSC OpenMM jobs now run the same Rg restraints as the beamline. The Slurm generator ignored the job's `openmm_parameters.md` and used 8 Rg targets spread over `rg_min`–`rg_max` with a hardcoded `k_rg` of 1, while the beamline runs the job's 6 targets with its `k_rg` (default 10). The generator now uses the job's Rg list, `k_rg`, `rg_report_interval` and `pdb_report_interval`, runs the 6 targets as GPU waves of 4 + 2, and fails at prep instead of skipping MD when a job has no Rg values.
