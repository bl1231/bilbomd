---
'@bilbomd/worker': minor
---

Add CHARMM36 force field fallback for non-standard backbone residues (SEP, TPO, PTR, CYM, CYSP).

Previously, backbone-integrated non-standard residues were incorrectly treated as standalone GAFF2 ligands, causing a crash when OpenMM tried to match the backbone of the adjacent standard residue. CHARMM36 (`charmm36_2024.xml`) ships with full backbone-aware templates for phosphoserine (SEP), phosphothreonine (TPO), phosphotyrosine (PTR), deprotonated cysteine (CYM), and phosphocysteine (CYSP).

The worker now detects these residues in the input PDB and automatically selects `charmm36_2024.xml + implicit/gbn2.xml` instead of the default AMBER19 force field. Backbone bonds missing after PDBFixer parsing are repaired before the system is built. If OpenMM still cannot resolve a residue, the unrecognized residue name and index are captured and surfaced in the job error message.
