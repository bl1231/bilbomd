---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': patch
---

Fix DNA representation consistency in Molstar viewer and add domain-based coloring.

- #768: DNA now renders consistently as cartoon (tube/slab) for both CHARMM and OpenMM pipelines. The fix uses a residue-name-based selection that recognises standard PDB names (DA, DT, DG, DC) and CHARMM names (ADE, GUA, CYT, THY) explicitly.
- #769: Add "Color by Domain" toggle button above the Molstar viewport. When active, fixed-body regions are colored blue and rigid-body regions orange, matching the PyMol movie scheme; flexible linkers retain the default chain coloring. The button appears whenever MD constraint data is available, independent of ensemble count.
