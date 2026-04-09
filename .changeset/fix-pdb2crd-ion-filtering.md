---
'@bilbomd/worker': patch
---

Strip metal ions (ZN, MG, CA, FE, etc.) from PDB chains before CHARMM pdb2crd conversion. Fixes job failure when PDB/CIF files contain ions that CHARMM's standard topology does not recognise. Ion-only chains are silently skipped rather than passed to CHARMM.
