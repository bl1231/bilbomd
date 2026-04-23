---
'@bilbomd/worker': patch
---

Normalize CHARMM-style DNA residue names (ADE/GUA/CYT) to standard PDB names (DA/DG/DC) before PDBFixer runs. OpenMM's pdbNames.xml maps ADE/GUA/CYT to RNA residues, causing PDBFixer to add spurious O2' atoms to DNA chains. DNA is detected by absence of the O2' ribose atom.
