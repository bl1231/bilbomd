---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Fixes to `multi_foxs` steps for the NERSC deployment
 - adjust backend `getFoxsBilboData` to look in the openmm dir for results
 - adjust the worker `run-multifox.py` script