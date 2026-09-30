---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Fix job resubmission for Classic (PDB/CRD) and Auto jobs: the Resubmit action is enabled again in the jobs list, the form opens the new job after submitting and shows backend errors, and the backend honours newly uploaded replacement files, reuses only the original files the form asks for (with a clear error if they have been cleaned up), limits reuse to the requester's own jobs, and processes constraint files the same way as a new submission.
