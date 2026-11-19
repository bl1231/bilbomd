---
'@bilbomd/worker': patch
---

OpenMM MD no longer crashes on DNA- or RNA-only models. The radius of gyration restraint and the Rg/Dmax tracking now use one atom per residue for both protein (CA) and nucleic acid (P), instead of protein CA only. Protein–DNA/RNA complexes now restrain the nucleic acid too, and a calcium ion named CA is no longer counted.
