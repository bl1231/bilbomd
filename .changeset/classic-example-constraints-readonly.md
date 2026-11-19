---
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Show the example data's MD constraints, read-only, on the BilboMD Classic form. A new public endpoint (`GET /api/v1/public/examples/classic/{pdb,crd}/constraints`) reads each example's const.inp against its structure, the same way an example job does, and the form shows the result with the job page's chain track and schematic.
