---
'@bilbomd/mongodb-schema': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Add optional charmm params to mongo job schema
Add helper function in backend to calculate Rg range for md runs
Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
Enhance the `BilboMDJobDTO` to support richer information for MongoDB Detail component
