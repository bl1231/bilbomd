---
'@bilbomd/md-utils': patch
'@bilbomd/worker': patch
'@bilbomd/backend': patch
---

Read `const.inp` files in order, as CHARMM does, so a `define` that reuses an earlier name no longer changes rigid bodies defined before it. OpenMM jobs whose constraint files did this were simulated with the wrong rigid bodies, or failed in the heat step with "Virtual site has nonzero mass". Constraints in which two rigid bodies share residues are now rejected at submission with a clear message, and the worker checks again before the OpenMM steps start.
