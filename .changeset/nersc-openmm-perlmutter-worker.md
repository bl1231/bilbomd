---
'@bilbomd/worker': patch
---

NERSC OpenMM jobs now run their helper steps (PAE to constraints, initial FoXS, FoXS, MultiFoXS, Rg plot) in `bilbomd-perlmutter-worker:0.0.31`. The helper scripts baked into `0.0.30` dated from April: `pae2const.py` now includes the OpenFold3 support and the AlphaFold3 pLDDT recovery from the PAE JSON (#876) that the beamline already uses, and `plot_rgyrs.py` reads the current Rgyr CSV column name (#1126). The image also moves to Python 3.12 and IMP/FoXS 2.25.0.
