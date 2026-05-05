---
'@bilbomd/worker': patch
'@bilbomd/ui': patch
---

Add PDB preparation step (strip waters and ions) to SANS OpenMM pipeline. Rename strip_ions.py → prep_pdb.py and runStripIons → runPrepPdb for accuracy — the script has always removed both HOH waters and metal/polyatomic ions.

Add GAFF2/metal cofactor alerts to the SANS new job form, matching the behaviour already present on the Classic PDB and Auto forms.
