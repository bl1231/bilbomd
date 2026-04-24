---
'@bilbomd/worker': minor
---

Switch OpenMM base force field from CHARMM36+HCT to Amber19SB+GBn2. Add carbohydrate detection for glycoprotein PDB inputs; when detected, the job fails early with an actionable error directing users to the CHARMM engine until full GLYCAM preprocessing support is implemented (see #655).
