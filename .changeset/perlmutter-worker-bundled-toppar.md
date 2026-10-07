---
'@bilbomd/worker': patch
---

NERSC CRD (CHARMM) jobs now use `bilbomd-perlmutter-worker:0.0.31`, which has the same force field as the beamline. `0.0.30` predated #630 and still read the old repo-managed toppar (CHARMM36, CGenFF 3.1) instead of the CHARMM c49b2 bundled files (CHARMM36m, CGenFF 4.6). The new image also carries the current `run-foxs-after-charmm.py`. The Perlmutter worker Dockerfile no longer updates conda from Anaconda's `defaults` channel and installs its Python packages into a dedicated Python 3.12 env, since the old setup no longer solved with the latest Miniforge.
