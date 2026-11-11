---
'@bilbomd/backend': patch
---

Validate SANS job uploads on the backend, as the other job types already do. The new `sansJobSchema` runs the same file checks as the SANS job form (structure, constraint file, file names and sizes) and checks the Rg range and D2O percentage. A failing upload gets a 400 with the list of errors, in the same format as the Classic job endpoints.
