---
'@bilbomd/ui': minor
'@bilbomd/backend': minor
'@bilbomd/worker': minor
'@bilbomd/mongodb-schema': minor
'@bilbomd/bilbomd-types': minor
---

Improve the BilboMD Multi job page. Multi jobs now have FoXS Analysis and Feedback & Validation tabs. The combined runs are listed with links, job type, status and the number of conformations each contributed, and the run whose SAXS data was used is marked. The page also shows the total number of conformations pooled for MultiFoXS. The fit assessment compares the SAXS molecular-weight estimate with the model mass when the combined runs model the same system. When their masses differ (for example a monomer and a dimer), it lists each run's mass instead.
