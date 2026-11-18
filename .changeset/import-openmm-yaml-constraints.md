---
'@bilbomd/ui': minor
'@bilbomd/bilbomd-types': minor
---

The job forms' constraints editor can start from an OpenMM constraints YAML or a constraints JSON file, as well as a `const.inp`. That covers `openmm_const.yml` or the full `openmm_config.yaml` from a BilboMD results download, and the `constraints` JSON the API takes. Files are read in the browser. Several fixed bodies are merged into one, since OpenMM holds all of them in place. Fields other than `chain_id`, `segid`, `residues` and `whole_segment` are left out and listed for the user. New in `@bilbomd/bilbomd-types`: `importConstraintsFromData`.
