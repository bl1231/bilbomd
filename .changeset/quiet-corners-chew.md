---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Refactor `backend` job handlers to accept `md_engine` (CHARMM or OpenMM) and handle it appropriately.

- Classic/PDB - accepts and adjusts steps accordingly
- Classic/CRD - rejects and informs caller
- Auto - accepts and adjusts steps accordingly
- AF - accepts and adjusts steps accordingly

Refactor `worker` pipeline code to handle `md_engine`

- `apps/worker/src/services/pipelines/bilbomd-auto.ts` now accepts OpenMM
- `apps/worker/src/services/functions/openmm-functions.ts` allows both `IBilboMDPDBJob` and `IBilboMDAutoJob` Job types.
