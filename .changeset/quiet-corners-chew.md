---
'@bilbomd/backend': patch
---

Refactor all backend job handlers to accept `md_engine` (CHARMM or OpenMM) and handle it appropriately.

- Classic/PDB - accepts and adjusts steps accordingly
- Classic/CRD - rejects and informs caller
- Auto - accepts and adjusts steps accordingly
- AF - accepts and adjusts steps accordingly
