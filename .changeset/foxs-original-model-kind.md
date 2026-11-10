---
'@bilbomd/ui': patch
'@bilbomd/backend': patch
'@bilbomd/bilbomd-types': minor
---

Stop showing a MultiFoXS ensemble as the "Original Model" on the FoXS Analysis tab.

- Each entry in the FoXS data response now has a `kind`: `original`, `ensemble` or `scoper`.
- BioEmu2 jobs have no starting model, so the UI used to show the 1-state ensemble as the "Original Model" (with c1/c2 `unk`) and leave it out of the ensemble charts. Those jobs now show no Original Model chart. The ensemble charts take the full width and include every ensemble size.
- The Dimensionless Kratky legend and the Fit quality table also use `kind` to decide which curve is the original model.
