---
'@bilbomd/worker': patch
---

NERSC CHARMM jobs now run `conformational_sampling` MD runs per Rg value, as the beamline does. The generator used `charmm_parameters.md.nsteps / 100000`, which matches only when the job doesn't send its own `charmm_md_nsteps`; a job with `num_conf=2` and `charmm_md_nsteps=300000` ran 2 runs per Rg on the beamline and 3 on NERSC. Jobs without `conformational_sampling` still fall back to `nsteps`.
