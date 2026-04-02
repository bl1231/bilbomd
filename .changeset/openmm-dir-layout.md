---
'@bilbomd/worker': minor
---

Standardize MD engine output directory layout across all pipelines and deployments.

All OpenMM steps now write to `openmm/minimize/`, `openmm/heat/`, and `openmm/md/` (previously used a flat `minimize/`, `heat/`, `md/` layout locally, and `openmm/minimization/`, `openmm/heating/`, `openmm/md/` at NERSC). CHARMM layout (`charmm/minimize/`, `charmm/heat/`, `charmm/md/`) is unchanged.

Also fixes a bug in `prepare-results.ts` where the NERSC OpenMM DAT file fallback path was identical to the local OpenMM path and would never find the NERSC file.
