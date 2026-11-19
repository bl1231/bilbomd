---
'@bilbomd/ui': minor
---

The Inp Jiffy can now start from any existing constraints file: a const.inp, an OpenMM constraints YAML, or bilbomd_job.json from a BilboMD results download, picked with a "Select Constraints File" button. Its instructions no longer assume CHARMM: they describe fixed, rigid and flexible regions for either MD engine and say the const.inp it writes works for OpenMM jobs too.
