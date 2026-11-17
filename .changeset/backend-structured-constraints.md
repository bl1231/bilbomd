---
'@bilbomd/backend': minor
'@bilbomd/worker': patch
'@bilbomd/bilbomd-types': patch
---

Security: CHARMM no longer streams constraint text written by users. Classic PDB, Classic CRD/PSF and SANS jobs accept constraints as JSON in a new `constraints` field. The backend validates them against the uploaded structure, then writes the only constraint file the MD engine reads: `const.inp` for CHARMM or `openmm_const.yml` for OpenMM. It also stores `md_constraints` when the job is created; previously a failure there was only logged.

Until uploads are removed, an uploaded `inp_file` is still accepted. It is read into the same structured form, validated the same way, deleted, and replaced by a file BilboMD writes. Files with commands other than `define`, `cons fix` and `shape desc` (including `cons harm`) are now rejected.

The worker checks that a job's `const.inp` is exactly what BilboMD writes for its stored constraints. The NERSC path no longer runs the CHARMM constraint check on an OpenMM job's `openmm_const.yml`, which made those jobs fail. `@bilbomd/bilbomd-types` adds `readCifSegments`, `constraintsFromStored` and `inputFromStored`.
