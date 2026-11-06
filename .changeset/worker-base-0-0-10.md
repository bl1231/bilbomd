---
'@bilbomd/worker': patch
---

Fix OpenMM running on the CPU instead of the GPU in worker 2.23.0. Base image 0.0.9 had picked up CUDA 13.5 libraries for OpenMM, newer than the GPU drivers on epyc (CUDA 13.3) and Berkelium (13.2) support, so OpenMM could not create a CUDA context: minimize and heat silently ran on the CPU, and MD logged `BILBOMD_CPU_FALLBACK`. The worker now builds on base image 0.0.10 (#1222), which pins OpenMM's CUDA libraries to 13.2 and updates OpenMM to 8.6.1.
