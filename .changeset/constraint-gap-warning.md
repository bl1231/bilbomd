---
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': minor
'@bilbomd/ui': minor
---

Constraint bodies that leave fewer than 2 flexible residues between them on a chain now get a warning (not an error) in the Classic, SANS and resubmit job forms and in the Inp Jiffy, so users know the linker has little room to move (#1101). The minimum is one shared constant, `MIN_FLEX_GAP` in `@bilbomd/bilbomd-types`, matching what `pae2const.py` enforces for Auto/AF/OF3 jobs. Uploads where a fixed body and a rigid body share residues are now rejected, for both `const.inp` and YAML constraint files; before, only rigid↔rigid overlaps were. `@bilbomd/md-utils` adds `findFixedRigidOverlaps` and `assertNoFixedRigidOverlaps`.
