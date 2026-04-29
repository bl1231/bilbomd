---
'@bilbomd/ui': minor
---

Enforce engine-driven input mode across all job forms. Classic form: MD engine selection now drives input format (CHARMM requires CRD/PSF from CHARMM-GUI, OpenMM accepts PDB/CIF). Auto, AlphaFold, and SANS forms: CHARMM engine option hidden, defaulting to OpenMM. Prevents PDB-to-CRD/PSF conversion failures with non-standard residues.
