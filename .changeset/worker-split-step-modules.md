---
'@bilbomd/worker': patch
---

Split the worker's two catch-all step modules into domain modules. `bilbomd-step-functions.ts` becomes `charmm-md.ts` (minimize/heat/dynamics), `pae-constraints.ts`, `autorg.ts` and `multifoxs.ts`, with `runPdb2Crd` moving into `pdb-to-crd.ts`. `bilbomd-sans-functions.ts` becomes `sans-trajectory.ts`, `sans-pepsisans.ts`, `sans-gasans.ts` and `sans-results.ts`. The local pipelines' `prepareBilboMDResults` step moves from the NERSC module to `prepare-results.ts`, the job type guards move to `job-type-guards.ts`, and SANS reuses the classic `writeSegidToChainid` instead of keeping a copy. Function bodies are moved unchanged, so no behaviour changes.
