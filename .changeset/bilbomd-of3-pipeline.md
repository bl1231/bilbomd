---
'@bilbomd/bilbomd-types': minor
'@bilbomd/mongodb-schema': minor
'@bilbomd/md-utils': patch
'@bilbomd/backend': minor
'@bilbomd/worker': minor
'@bilbomd/ui': minor
---

Add BilboMD OF3 pipeline using OpenFold3 for structure prediction.

OpenFold3 replaces ColabFold as the structure predictor and supports Protein,
DNA, and RNA chains simultaneously. The downstream OpenMM MD + FoXS + MultiFoXS
pipeline is identical to BilboMD AF. Input is a JSON query file; the best sample
is selected by `sample_ranking_score` from OpenFold3 confidence outputs.
