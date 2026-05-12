---
'@bilbomd/worker': minor
---

Enable parallel OpenMM MD runs on a single GPU via CUDA process sharing. Set `OPENMM_MD_CONCURRENCY` env var to run multiple Rg-constrained MD simulations concurrently on one A100, significantly reducing total MD wall time.
