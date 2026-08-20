---
'@bilbomd/backend': patch
---

Security: enforce job ownership on all `/jobs/:id*` routes and `/external/jobs/:id/results`. A new `verifyJobOwnership` middleware returns 404 unless the requester owns the job or holds the Admin/Manager role, closing an IDOR where any authenticated user could read, download, or delete any job by id. Also sanitizes the PDB filename in `downloadPDB`. Fixes #981.
