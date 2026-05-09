---
'@bilbomd/worker': minor
---

Add Dmax computation to OpenMM reporter and fix null Rgyr/Dmax in consolidated_rgyr_dmax_data.json for OpenMM jobs.

Renames `RadiusOfGyrationReporter` to `RgyrDmaxReporter` (backward-compatible alias kept) and extends it to also compute and write Dmax alongside Rgyr, using CA atoms only — consistent with the CHARMM dcd2pdb pipeline. The combined CSV is now named `rgyr_dmax.csv` (previously `rgyr.csv` locally, `rgyr_report.csv` on NERSC).

Updates `rgyr_v_dmax_analysis.py` to read `rgyr_dmax.csv` files from `openmm/md/rg_*/` directories when building `consolidated_rgyr_dmax_data.json`, so OpenMM jobs now have non-null `rgyr` and `dmax` values instead of `null`.
