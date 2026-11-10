---
'@bilbomd/worker': minor
---

Superpose the members of BilboMD BioEmu2 ensembles on the rigid domain they share (bilbomd#1200). BioEmu2 writes each structure in an arbitrary orientation, so ensemble members did not line up. After polishing, the new `align_ensemble.py` finds the rigid domains from all the sampled structures (residue pairs whose distance varies by less than 1.5 Å), superposes every member on the largest one, and the ensemble PDBs in the results use those copies. When no rigid domain is found, all residues are used. The results also gain `alignment.json`, which lists the domains and carries the matrix they were found from. The fit to the SAXS data is unchanged.
