---
'@bilbomd/worker': patch
---

Fix intermittent `ParallelSaveError` in the MD step by persisting step status via an atomic field update instead of a full-document save. Concurrent OpenMM per-Rg MD runs previously called `job.save()` on the same document instance simultaneously, throwing "Can't save() the same doc multiple times in parallel".
