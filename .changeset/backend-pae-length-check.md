---
'@bilbomd/backend': patch
---

Reject Auto job submissions whose PAE matrix size doesn't match the structure's residue count, with a message giving both numbers. Previously these jobs were queued and failed on the worker in the `pae` step. Residues are counted the same way `pae2const.py` counts them (#1232).
