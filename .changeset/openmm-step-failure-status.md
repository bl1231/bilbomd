---
'@bilbomd/worker': patch
---

Mark jobs and the specific failing step as 'Error' in MongoDB when any pipeline step throws. Previously, a partial OpenMM MD failure (e.g. one Rg target diverging with "Particle coordinate is NaN") left the job stuck as 'Running' with the MD step showing "5/6 completed". Pipeline steps in all OpenMM-capable pipelines (pdb, auto, alphafold, openfold, sans) are now wrapped with a shared `runPipelineStep` helper that invokes `handleError` so failures are surfaced clearly to the user.
