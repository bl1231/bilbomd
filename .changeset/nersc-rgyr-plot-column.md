---
'@bilbomd/worker': patch
---

Fix the NERSC OpenMM `analysis` step, which failed every job with `KeyError: 'Radius_of_Gyration_nm'` because `plot_rgyrs.py` still read the old column name while `rgyr.py` writes `Rgyr_A`. The Rg plot is not used by the results, so a failure there no longer fails the Slurm job.
