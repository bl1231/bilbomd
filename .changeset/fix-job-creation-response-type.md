---
'@bilbomd/ui': patch
---

Fix job submission error by correcting API response type handling. The job creation endpoints return a flat response structure with jobid, uuid, and md_engine fields, but the frontend was expecting a nested BilboMDJobDTO structure. Added JobCreationResponse interface and updated all job form components to handle the correct response structure.
