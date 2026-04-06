---
'@bilbomd/backend': patch
---

Add PDB residue validation to reject unsupported residues at job submission time. PDB files containing residue names not handled by pdb2crd.py now return a clear error message listing the offending residues, rather than silently failing during job processing.
