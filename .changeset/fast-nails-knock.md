---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Fixes to `multi_foxs` steps for the NERSC deployment
 - adjust backend `getFoxsBilboData` to look in the `openmm/md` directory for results
 - adjust the worker `run-multifoxs.py` script to accept various command line args.