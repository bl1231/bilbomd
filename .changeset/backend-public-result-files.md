---
'@bilbomd/backend': patch
---

`GET /public/jobs/:publicId/results/:filename` now serves only the files the public job page loads by name: the ensemble and starting models for Mol* (`ensemble_size_<N>_model.pdb`, `minimization_output.pdb`, `scoper_combined_*.pdb`), the PAE tab images (`pae.png`, `viz.png`) and the BioEmu2 `alignment.json`. Any other name gets the same 404 as a missing file, before the job is looked up. Inputs, `params.json`, logs and intermediate files in the job dir are no longer reachable through this route; the full results stay available as the `/results` tarball.
