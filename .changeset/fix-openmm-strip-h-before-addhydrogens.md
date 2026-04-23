---
'@bilbomd/worker': patch
---

Fix OpenMM minimize crash for DNA/RNA complexes by stripping all H atoms before calling addHydrogens. PDBFixer can partially hydrogenate DNA/RNA residues, leaving them in a state that fails forcefield template matching. Stripping all H first lets addHydrogens place them correctly from forcefield templates.
