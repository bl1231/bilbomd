---
'@bilbomd/ui': minor
'@bilbomd/backend': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/worker': patch
---

Compare the model's mass with the SAXS data before a job is submitted.

- New `POST /mw-check` endpoint: takes the SAXS file and a PDB, a PSF or sequences, and returns the same molecular-weight comparison as a finished job's report.
- The Classic (PDB and CRD/PSF), Auto, AlphaFold, OpenFold3, BioEmu2 and Scoper forms show the result above the submit button as soon as both the data and the model are present. It is advisory and never blocks submission.
- Model mass is now counted from residues rather than listed atoms, so a structure without hydrogens is not read about 7% light. The finished-job report uses the same count.
