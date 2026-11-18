---
'@bilbomd/backend': major
'@bilbomd/ui': patch
---

**Breaking:** constraint files are no longer accepted. Classic PDB, Classic CRD/PSF and SANS jobs, through the job forms, the anonymous public routes and the external API, take their MD constraints only as JSON in the `constraints` form field. BilboMD writes the CHARMM `const.inp` or the OpenMM constraints itself, so text written by users never reaches CHARMM.

- An `inp_file` upload (or `const_inp_file`/`omm_const_file`) gets a 400 explaining the change. It points to the `constraints` field, `/api-docs`, and the job form's constraints editor, which can convert an existing `const.inp` or OpenMM YAML.
- A resubmission asking to reuse the original constraint file (`reuse_inp_file`) gets the same 400. The resubmit form sends the constraints as JSON.
- Example data still works. The example's own `const.inp` is converted on the server like any other input and replaced by a file BilboMD writes. Constraints sent along with example data replace the example's.
- The API docs describe the `constraints` field, with examples for PDB (by `chain_id`) and CRD/PSF (by `segid`). They no longer list a constraint file or wrongly require `crd_file` for PDB jobs.
- The UI's Classic form instructions and pipeline diagrams describe setting up constraints in the form instead of uploading a `const.inp`.
