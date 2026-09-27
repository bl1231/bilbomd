---
'@bilbomd/worker': patch
---

Refactor the six local BilboMD pipelines (pdb, crd, auto, alphafold, openfold, sans) onto a shared declarative runner (`runPipeline`) and reusable step sequences (`pipelines/steps.ts`). Pipelines shrink from ~1,100 to ~250 lines. Behaviour is unchanged (pinned by new characterization tests) except that the CRD pipeline now logs its MD engine and runs its steps through `runPipelineStep` like the others, so a failing CRD step marks the job and step as Error in the same way.
