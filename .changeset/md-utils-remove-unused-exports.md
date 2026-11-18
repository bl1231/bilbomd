---
'@bilbomd/md-utils': major
---

Remove exports nothing calls any more: `buildChainSegidMap`, `convertYamlToInp`, `validateInpConstraints`, `findFixedRigidOverlaps`, `assertNoFixedRigidOverlaps` and `findRigidBodyOverlaps`. The fixed/rigid overlap check still runs inside `validateYamlConstraints`, and the rigid/rigid check inside `assertNoRigidBodyOverlaps`. `buildChainMolTypes` now classifies residues with `classifyResidue` from `@bilbomd/bilbomd-types`, which also treats the CHARMM names ADE, CYT, GUA and THY as DNA.
