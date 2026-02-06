---
'@bilbomd/worker': patch
---

Apparently Python sets have non-deterministic iteration order. This was makign our `pdb2crd.py` script produce inconsistent results.
