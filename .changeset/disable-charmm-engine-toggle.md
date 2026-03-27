---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Add `ENABLE_CHARMM_ENGINE` env var to allow deployments to disable the CHARMM md_engine option in all job forms. When set to `false`, the CHARMM radio button is disabled and forms default to OpenMM.
