---
'@bilbomd/mongodb-schema': patch
'@bilbomd/bilbomd-types': patch
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Add optional charmm params to mongo job schema
Add helper function in backend to calculate Rg range for md runs
Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
