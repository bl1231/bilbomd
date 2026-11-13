---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': patch
'@bilbomd/ui': patch
'@bilbomd/worker': patch
---

OpenMM Classic PDB and SANS jobs no longer run with fewer constraints than their `const.inp` asks for. The OpenMM conversion only reads `define NAME sele ( resid A:B .and. segid S ) end`, and used to drop any other selection (whole segids, single residues, several segids per range), names no define sets, and commands such as `cons harm`, with no warning. Such files are now rejected at upload, in the job forms and in the backend, with a message naming the lines. Single-residue fixed segments are rejected too, since OpenMM's fixed bodies would hold nothing (#1101). CHARMM jobs are unchanged. The worker logs a warning if an older OpenMM job's `const.inp` has lines it will not apply. `@bilbomd/bilbomd-types` adds `findOpenMMIgnoredConstInpLines`, `findSingleResidueFixedSegments` and `openmmConstInpMessage`.
