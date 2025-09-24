---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Fixes to `multi_foxs` steps for the NERSC deployment
 - adjust backend `getFoxsBilboData` to look in the `openmm/md` directory for results
 - adjust the worker `run-multifox.py` script to accept variosu command line args.