---
'@bilbomd/backend': patch
---

Tighten how job submissions resolve their input files: handlers only use uploaded files or files the server itself placed in the job directory (example data, resubmission), upload names are always stored inside the job directory, and the CRD pipeline prepares its constraint file only after validation.
