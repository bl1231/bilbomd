---
'@bilbomd/worker': patch
---

Tidy the NERSC and multi pipelines, the last part of the worker module split. `bilbomd-step-functions-nersc.ts` is renamed `nersc-slurm.ts` and loses its unused `copyBilboMDResults` / `sendBilboMDEmail` (the NERSC monitor uses the versions in `job-monitor-functions.ts`). The monitor now uses the shared `prepareBilboMDResults` from `prepare-results.ts` instead of its own copy, so a NERSC job's results step is recorded the same way as on the local pipelines, with timing, and OpenFold jobs are accepted. The NERSC submission and multi pipelines share one helper each for building their usage events. Both pipelines are pinned by new characterization tests.
