---
'@bilbomd/worker': minor
---

Run every external tool through the shared `runProcess` helper: CHARMM (all steps and pdb2crd), FoXS (initial and per-file), MultiFoXS, Pepsi-SANS, GA-SANS, PyMOL movies, ffmpeg, and the Python helper scripts (feedback, rgyr/Dmax, AutoRg, pae2const, pdb2crd, prep_pdb, cif_to_pdb, strip_cofactors).

- Every process now has a timeout, configurable per tool via `PROCESS_TIMEOUT_*` (see `infra/.env.example`); defaults are ~3-4x the longest runs seen in production.
- Fixes processes that could hang forever on a full stdio pipe: per-file FoXS and Pepsi-SANS and the ffmpeg poster/thumbnail calls never read their output. `runProcess` now ignores stdout nobody consumes and always drains stderr.
- Failures report what happened plus the last stderr lines ("MultiFoXS exited with code 2", "CHARMM md_rg25.inp timed out after 21600s", "GA-SANS failed to start: … ENOENT") instead of generic messages. CHARMM failures show only the CHARMM error lines, not the whole output. GA-SANS no longer crashes the worker when its interpreter is missing.
- pae2const's timeout goes from a hard 5 min SIGKILL to 15 min with a TERM grace period.
