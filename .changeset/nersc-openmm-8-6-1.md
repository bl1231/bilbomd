---
'@bilbomd/worker': patch
---

NERSC OpenMM jobs now run on the `bilbomd-openmm-worker:0.0.14` image on Perlmutter: OpenMM 8.6.1 (was 8.5.1), still compiled from source against CUDA 12.9, with the image's conda CUDA libraries pinned to 13.2 to match Perlmutter's driver. The image is built and migrated on Perlmutter; the build steps are now in `apps/worker/README.md`.
