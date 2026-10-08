---
'@bilbomd/worker': patch
---

Record `md_constraints` and `openmm_forcefield` for NERSC jobs. The beamline pipelines write them while running, but a NERSC job runs those steps on Perlmutter, so the fields were never saved and the MD constraint track stayed empty for NERSC Auto and AlphaFold jobs. The NERSC job monitor now reads them from the files the Slurm job writes (`openmm_config.yaml` for OpenMM, `const.inp` for CHARMM): through the NERSC API from the PSCRATCH work dir as soon as status.txt shows the constraint step finished, so the track appears while MD runs as on the beamline, and again from the files copied back to CFS when the job completes. CHARMM Auto/AlphaFold jobs are also pointed at their generated `const.inp` so it is included in the results.
