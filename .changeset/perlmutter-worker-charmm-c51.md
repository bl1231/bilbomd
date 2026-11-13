---
'@bilbomd/worker': patch
---

Perlmutter Slurm jobs use `bilbomd-perlmutter-worker:0.0.32`, built with CHARMM c51b1. The Perlmutter Dockerfile now ships CHARMM's shared library (CHARMM 51 builds `charmm` as a launcher plus `libchmm.so`) and fails the build if CHARMM can't start.
