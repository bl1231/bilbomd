---
'@bilbomd/worker': patch
---

Move OpenMM MD PDB frame writing to after simulation completes, eliminating GPU stalls per Rg run caused by inline text-format writes blocking the trajectory.
