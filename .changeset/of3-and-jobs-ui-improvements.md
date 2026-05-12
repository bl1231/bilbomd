---
'@bilbomd/ui': patch
'@bilbomd/backend': patch
---

Fix OF3 pipeline issues and add Jobs runtime column.

- Correct the OpenFold3 GitHub link in the OF3 job form instructions to point to the right repository (aqlaboratory/openfold-3)
- Add "Experimental - Please report problems to Scott" label to the OF3 job form header
- Fix 404 error on the OF3 "Download Example Data" button by wiring up the missing backend route and handler
- Add a Runtime column to the Jobs table showing wall-clock duration from submission to completion for all job types (live for running jobs)
