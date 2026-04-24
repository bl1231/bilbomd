---
'@bilbomd/worker': minor
---

Add GLYCAM glycoprotein support for PDB + OpenMM pipeline (issue #655 Phase 2).

Glycosylated PDB inputs submitted with the OpenMM engine are now processed correctly instead of failing with an error. Key changes:

- New `strip_cofactors.py` strips FAD, HEM, PCA, and other cofactors that have no bundled Amber parameters before MD; writes `stripped_cofactors.json` so the pipeline can surface a user warning.
- New `utils/glycam_rename.py` (importable) and `glycam_rename.py` (CLI) convert standard PDB residue names to GLYCAM format before PDBFixer runs: ASN→NLN (N-linked), THR→OLT and SER→OLS (O-linked); sugar residues renamed to GLYCAM codes (0NB for terminal GlcNAc, 0MA/0MB for terminal mannose, etc.). Anomer determined from 3D geometry.
- `minimize.py` calls GLYCAM rename when `has_carbohydrates: true` in config, and skips `PDBFixer.addMissingAtoms()` for glycoprotein inputs (PDBFixer has no carbohydrate templates).
- `openmm-functions.ts` no longer throws for glycoproteins; sets `has_carbohydrates` in the config YAML and adds `amber14/GLYCAM_06j-1.xml` to the force field list when carbs are detected.
- `bilbomd-pdb.ts` runs the cofactor-strip step in the OpenMM branch before config preparation.
