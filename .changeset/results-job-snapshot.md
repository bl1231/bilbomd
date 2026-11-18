---
'@bilbomd/worker': patch
---

Privacy: the `bilbomd_job.json` in every results download no longer contains the whole job record. It used to include the owner's email and username, the `results_token` that opens a signed-in user's results without logging in, and an anonymous submitter's `public_id` and IP hash. It now keeps only the fields that describe the run: title, engine, status and steps, timestamps, input file names, Rg settings, constraints, MD parameters, SANS/AlphaFold/OpenFold/BioEmu/Scoper settings, feedback and results. Fields not on that list stay out, including any added to the job schema later. The multi-job summary no longer includes the owner's email and username.
