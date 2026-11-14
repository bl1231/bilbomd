---
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': minor
'@bilbomd/ui': minor
'@bilbomd/backend': patch
---

Constraint bodies that leave fewer than 2 flexible residues between them on a chain now get a warning (not an error) in the Classic, SANS and resubmit job forms and in the Inp Jiffy, so users know the linker has little room to move (#1101). The minimum is one shared constant, `MIN_FLEX_GAP` in `@bilbomd/bilbomd-types`, matching what `pae2const.py` enforces for Auto/AF/OF3 jobs. Uploads where a fixed body and a rigid body share residues are now rejected, and overlap checks now run on every route that takes a `const.inp` (Classic PDB, Classic CRD/PSF, SANS) in the upload schema and the job forms, before a job is created; before, only rigid↔rigid overlaps were checked, and only for Classic PDB. The `const.inp` checks read every accepted selection form (single residues, whole segments, several segids) and key by segid. `@bilbomd/bilbomd-types` adds `findConstInpOverlaps`, `constInpOverlapMessage` and `constInpCloseBodiesMessage`; `@bilbomd/md-utils` adds `findFixedRigidOverlaps` and `assertNoFixedRigidOverlaps` for YAML constraints.
