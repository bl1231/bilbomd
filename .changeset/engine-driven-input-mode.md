---
'@bilbomd/ui': minor
---

Enforce engine-driven input mode across all job forms. Classic form: MD engine selection now drives input format (CHARMM requires CRD/PSF from CHARMM-GUI, OpenMM accepts PDB/CIF). Auto, AlphaFold, and SANS forms: CHARMM engine option hidden, defaulting to OpenMM. Prevents PDB-to-CRD/PSF conversion failures with non-standard residues. Metal cofactor warning now suggests CHARMM-GUI with inline link button. Fix Classic form regressions: Conformations per Rg defaults to 600 for OpenMM, auto-Rg validation no longer requires manual field interaction. Fix Help page pipeline schematic images for dark mode support.
