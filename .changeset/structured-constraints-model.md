---
'@bilbomd/bilbomd-types': minor
'@bilbomd/mongodb-schema': minor
---

Add a structured constraints model, the first step in replacing uploaded CHARMM `const.inp` files. New in `@bilbomd/bilbomd-types`:

- `validateConstraintsInput` validates constraints sent as JSON against the uploaded structure. Structures are read by `readPdbSegments`, with segids named the way pdb2crd names them, or by `readPsfSegments`.
- `writeConstInp` and `toOpenMMConstraints` turn the validated constraints into the CHARMM constraint file and the OpenMM constraints.
- `importConstraintsFromConstInp` reads an old `const.inp` into the new format (for use in the browser).

Constraint segments in `md_constraints` gain optional `segid` and `whole_segment` fields. Nothing uses these yet, so behaviour is unchanged.
