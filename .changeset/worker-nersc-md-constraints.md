---
'@bilbomd/worker': patch
---

Record `md_constraints` and `openmm_forcefield` for NERSC jobs. The beamline pipelines write them while running, but a NERSC job runs those steps on Perlmutter, so the fields were never saved and the MD constraint track stayed empty for NERSC Auto and AlphaFold jobs. The NERSC job monitor now reads them from the files copied back to CFS (`openmm_config.yaml` for OpenMM, `const.inp` for CHARMM) when the job completes, and points CHARMM Auto/AlphaFold jobs at their generated `const.inp` so it is included in the results.
