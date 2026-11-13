---
'@bilbomd/worker': minor
---

Build the worker on base image 0.0.11, which has no CHARMM. The published `bilbomd-worker` image no longer contains CHARMM. epyc runs CHARMM jobs on the `bilbomd-worker-charmm` image it builds locally. Workers on the published image (Berkelium, NERSC Spin) fail CHARMM jobs at the start with a message to resubmit with OpenMM. Perlmutter's CHARMM runs are unaffected.
