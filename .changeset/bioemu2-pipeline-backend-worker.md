---
'@bilbomd/mongodb-schema': minor
'@bilbomd/bilbomd-types': minor
'@bilbomd/md-utils': minor
'@bilbomd/backend': minor
'@bilbomd/worker': minor
---

Add the BilboMD BioEmu2 pipeline (bilbomd#1200, step 1: API only, no UI form yet). Submitting sequence entities and SAXS data to `POST /jobs/bilbomd-bioemu` runs AutoRg, then Rg-steered BioEmu2 sampling in the new `bioemu2-service` in place of MD, then FoXS and MultiFoXS. The members of the best ensembles are then polished with a restrained OpenMM minimization. The pipeline is behind `ENABLE_BILBOMD_BIOEMU` and open to Admins only, with a system-size limit (`BIOEMU_MAX_TOKENS`, default 1,000).
