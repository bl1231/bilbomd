---
'@bilbomd/ui': minor
'@bilbomd/backend': minor
'@bilbomd/worker': minor
'@bilbomd/bilbomd-types': minor
---

Add support for mmCIF (.cif) file uploads in Classic/pdb and Auto job types.

Users can now upload AlphaFold 3 (or any standard mmCIF) files directly into BilboMD without manual conversion. The frontend and backend validate chain IDs and residue names from the `_atom_site` loop block using the same `SUPPORTED_PDB_RESIDUES` allowlist used for PDB validation. The worker converts CIF to PDB at pipeline start using biopython before CHARMM or OpenMM processing.
