---
'@bilbomd/mongodb-schema': patch
'@bilbomd/worker': patch
---

Add openmm_forcefield field to job documents to record the OpenMM force field
files selected at runtime (e.g. AMBER19, CHARMM36, GLYCAM).
