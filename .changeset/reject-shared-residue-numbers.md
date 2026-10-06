---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Reject PDB uploads in which two residues share a chain and residue number, such as a glycan numbered inside the protein's range. These files failed later in OpenMM minimization with an unhelpful template error; the upload now explains which residues collide and how to renumber them. The GLYCAM renaming step also stops with a clear message if it meets such a file.
