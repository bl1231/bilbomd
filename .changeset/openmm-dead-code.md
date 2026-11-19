---
'@bilbomd/worker': patch
---

Remove unused code from the OpenMM scripts: old Rg reporters and restraint helpers in `rgyr.py` (and the unused `weigh_by_mass` option), the pairwise rigid-body constraint function, the zero-mass fixed-body variant, and the standalone `glycam_rename.py` command-line wrapper. No change in behaviour.
