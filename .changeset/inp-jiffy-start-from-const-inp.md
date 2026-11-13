---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': minor
---

The Inp Jiffy can start from an existing `const.inp`: upload it with the PDB and its fixed and rigid bodies fill in the next step, checked against the PDB's chains. Anything it can't use (unknown chains, other selection forms, `cons harm`, undefined names) is listed instead of dropped silently. `@bilbomd/bilbomd-types` adds `readConstInp`, which keeps each segid and reports the commands it skipped; `parseConstInp` output is unchanged. New rigid bodies in the jiffy no longer reuse an ID after a delete.
