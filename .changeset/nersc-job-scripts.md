---
'@bilbomd/worker': patch
---

NERSC jobs now run their helper and MD scripts (FoXS/MultiFoXS helpers, `merge_constraints.py`, `pae2const.py`, `pdb2crd.py`, and the OpenMM `minimize`/`heat`/`md`/`plot_rgyrs` scripts) from a copy that deploys with the worker, instead of the copies baked into the `bilbomd-perlmutter-worker` and `bilbomd-openmm-worker` images. `sync-nersc-scripts-to-cfs.sh` copies the scripts listed in `job-scripts.txt` to CFS next to the generators, and each generator snapshots them into the job's workdir (`.scripts`), so script fixes reach NERSC with a normal deploy and a queued job keeps the scripts it was prepared with. The images now only provide the runtime (Python envs, CHARMM, OpenMM, FoXS).
