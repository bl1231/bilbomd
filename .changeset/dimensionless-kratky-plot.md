---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Add a dimensionless Kratky plot to the FoXS analysis panel. autorg.py now emits i0, rg_exact, r2, and qrg bounds alongside the existing Rg values; the backend attaches the Guinier fit (Rg, I0, fit window) to FoXS analysis responses, computing it on demand via autorg.py and caching the result as autorg.json in the job directory so existing completed jobs benefit without reprocessing. The UI renders a dimensionless Kratky chart ((qRg)²·I(q)/I(0) vs qRg) below the I(q) plots, overlaying the experimental curve with the original model and ensemble model curves, with reference crosshairs at the globular peak position (√3, 1.104).
