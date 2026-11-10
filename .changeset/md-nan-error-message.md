---
'@bilbomd/worker': patch
---

Report unstable OpenMM MD runs clearly. When a run dies with NaN coordinates the job error now names the affected Rg targets and suggests narrowing the Rg range, instead of `md.py failed (exit 1)`. Also stop logging those failures as `Invalid OMM_RG value`.
