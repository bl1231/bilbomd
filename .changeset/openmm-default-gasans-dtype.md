---
'@bilbomd/backend': minor
'@bilbomd/worker': patch
---

Default `md_engine` to OpenMM for PDB, Auto, SANS and AlphaFold jobs when a request omits it; CHARMM now runs only when asked for. AlphaFold jobs that ask for CHARMM get a 400 at submit time unless the deployment runs on NERSC, instead of failing in the worker after waiting in the queue. Fix GA-SANS crashing with "Cannot cast array data from dtype('O')" under pandas 3.
