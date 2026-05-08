---
'@bilbomd/worker': patch
---

Refactor results-gathering utilities to eliminate duplication across pipelines.

- Extract `copyFiles`, `writeJsonFile`, and `createResultsArchive` as shared exports from `prepare-results.ts`; remove local copies from `bilbomd-sans-functions.ts` and `bilbomd-multi-functions.ts`
- Unify three separate `createReadmeFile` implementations into the shared `create-readme-file.ts`, now supporting all job types (PDB, CRD, Auto, AlphaFold, OpenFold, SANS, Multi)
- Move `bilbomd_job.json` write to after the feedback script runs so the snapshot reflects any feedback fields saved back to MongoDB
