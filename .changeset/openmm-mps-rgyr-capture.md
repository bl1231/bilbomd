---
'@bilbomd/worker': patch
---

Buffer RgyrDmax rows in memory and write CSV after simulation, eliminating per-step disk flushes. Add CUDA MPS pipe mount to Epyc dev compose for GPU-sharing experiment.
