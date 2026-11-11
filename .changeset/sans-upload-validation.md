---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Validate SANS job uploads on the backend, as the other job types already do. The new `sansJobSchema` runs the same file checks as the SANS job form (structure, constraint file, file names and sizes) and checks the Rg range and D2O percentage. A failing upload gets a 400 with the list of errors, in the same format as the Classic job endpoints.

The constraint file's segment ID rule now runs on the backend too. Each job schema names its input mode (Classic PDB and SANS use the PDB rule, Classic CRD/PSF the 4-letter rule), where before the backend read the mode from a validation context the handlers never set. The SANS job form also applies the PDB rule now.
