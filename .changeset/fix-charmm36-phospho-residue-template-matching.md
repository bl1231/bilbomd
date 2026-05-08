---
'@bilbomd/worker': patch
---

Fix OpenMM template matching failure for CHARMM36 phospho-residues (TPO, SEP, PTR).

Three root causes were identified and fixed in `model_prep.py`:

1. **Wrong H atom names from PDBFixer**: PDBFixer adds CCD-based H atoms to TPO/SEP/PTR with names incompatible with the CHARMM36 template (e.g. `H`/`H2` instead of `HN`, `HOP2`/`HOP3` instead of `H3T`). These are now stripped and re-added with correct CHARMM36 names via full hydrogen definitions.

2. **Missing intra-residue bonds**: PDBFixer leaves TPO/SEP/PTR residues with no internal bond connectivity, causing OpenMM's graph-based template matcher to fail. New function `_add_charmm36_intra_bonds()` reads bonds directly from the CHARMM36 ForceField templates and adds them before `addHydrogens()` is called.

3. **Phosphate oxygen name mismatch**: Some PDB files use PDB standard `OP1`/`OP2`/`OP3` while the CHARMM36 template requires `O1P`/`O2P`/`O3P`. New function `_rename_charmm36_atoms()` normalises these names. The `pdbNames.xml` alias only applies to Nucleic residues, not protein-context phospho-residues.
