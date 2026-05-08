---
'@bilbomd/worker': minor
---

Add CHARMM36 force field fallback for proteins with phosphorylated residues (SEP, TPO, PTR).

Previously, phosphoserine (SEP), phosphothreonine (TPO), and phosphotyrosine (PTR) were incorrectly treated as standalone GAFF2 ligands, causing a crash when OpenMM tried to match the backbone of the preceding residue. CHARMM36 (`charmm36_2024.xml`) ships with full backbone-aware templates for all three residue types.

The worker now detects phosphorylated residues in the input PDB and automatically selects `charmm36_2024.xml + implicit/gbn2.xml` instead of the default AMBER19 force field. If OpenMM still cannot resolve a residue after force field selection, the unrecognized residue name and index are now captured and surfaced in the job error message.
