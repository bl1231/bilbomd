---
'@bilbomd/bilbomd-types': patch
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Move the supported PDB residue list to a single constant (`SUPPORTED_PDB_RESIDUES`) in `@bilbomd/bilbomd-types`, shared by both the backend validator and the frontend `hasAllowedResiduesOnly` check. Eliminates the risk of the two lists diverging silently. Also adds common ions (MG, CA, ZN, etc.) and HSD to the allowed set, and adds the missing `pdbCheck()` to the Auto job form schema.
