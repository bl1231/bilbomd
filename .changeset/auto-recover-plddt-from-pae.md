---
'@bilbomd/worker': patch
---

Auto jobs: recover per-residue pLDDT from the AlphaFold3-style PAE JSON (`atom_plddts`) when the uploaded structure's B-factor column is all zeros. Previously, structures that lost their pLDDT during preparation (e.g. protonation) silently produced no fixed_bodies or rigid_bodies, leaving the model un-flexed. pae2const.py now aligns `atom_plddts` to the structure's heavy atoms and logs the recovery, with a clear warning when neither the B-factor column nor the JSON carry pLDDT.
