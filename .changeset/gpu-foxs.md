---
'@bilbomd/worker': minor
---

Optional GPU FoXS (#1157). With `FOXS_GPU=auto`, the FoXS step runs dina-lab3D's standalone FoXS (`foxs-gpu`, now in worker base image 0.0.9) on the GPU, 50 PDBs per call and 8 calls at once (`FOXS_GPU_BATCH_SIZE`, `FOXS_GPU_CONCURRENCY`). The #1157 benchmark measured it 8–10× faster than IMP FoXS with the same profiles and ensembles. When no GPU is visible, all files run on IMP FoXS. A batch that fails, or that skips some profiles, is rerun on IMP FoXS for just those files. The default is `off`, so nothing changes until a deployment opts in.
