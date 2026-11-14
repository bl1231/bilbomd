---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': minor
---

The Inp Jiffy can start from an existing `const.inp`: upload it with the PDB and its fixed and rigid bodies fill in the next step, checked against the PDB's chains. Anything it can't use (unknown chains, unreadable selections, `cons harm`, undefined names) is listed instead of dropped silently. `@bilbomd/bilbomd-types` adds `readConstInp`, which keeps each segid, reads single residues, whole segments (`segid HETA`), several segids per range and 4-letter keyword abbreviations, and reports the commands it skipped. `parseConstInp` (used for `md_constraints` and the OpenMM constraints) still reads only `resid a:b .and. segid S` defines, so its output is unchanged. New rigid bodies in the jiffy no longer reuse an ID after a delete.
