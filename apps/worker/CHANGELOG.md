# @bilbomd/worker

## 1.23.0

### Minor Changes

- 6c1e84e: Add OpenMM config and constraint files to results dir
  Reorganize pipeline functions

### Patch Changes

- 3e2f5b4: Update pnpm and dependencies
- Updated dependencies [3e2f5b4]
  - @bilbomd/md-utils@1.0.4

## 1.22.1

### Patch Changes

- 267faf5: Adjust alpha factor for MW estimation in `mw_bayes.py`
- d51af33: Make sure we reserve GPUs for our workers on machines with GPUs.

## 1.22.0

### Minor Changes

- e110840: Add ability to make mp4 movies from Molecular Dynamics trajectory file (`*.dcd` files)
  Creates one mp4 moview per DCD file. Only implemented for OpenMM.
  Add movie gallery and viewer to Jobs result page in UI.
  Add PyMOL to the `bilbomd-worker-base` image

### Patch Changes

- 258ac41: Use `set` to update `md_constraints` in mongo ratehr than direct assignment of YAML values.
- Updated dependencies [e110840]
  - @bilbomd/mongodb-schema@1.12.0
  - @bilbomd/md-utils@1.0.3

## 1.21.0

### Minor Changes

- 9d755b6: Add OpenMM params to MongoDB Job Schema
  Remove all `OMM_*` env variables from `.env.example`
  Remove all `OMM_*` env variables from `infra/helm/templates/bilbomd-configmaps.yaml`

### Patch Changes

- ef6ace8: Fix CLI arg for `pae2const.py` in the NERSC slurm prep script `apps/worker/scripts/nersc/gen-openmm-slurm-file.py`.
  Add a new `README.md` with instructions on building `bilbomd-worker-base` Docker image
  Bump CHARMM to `c49b2`
- 5abfc4f: bump `bilbomd-worker-base` to `v0.0.3`
- Updated dependencies [9d755b6]
  - @bilbomd/mongodb-schema@1.11.0
  - @bilbomd/md-utils@1.0.2

## 1.20.0

### Minor Changes

- 1cfa2b1: Store `md_constraints` in mongodb

### Patch Changes

- 1bfa7ef: Implement p-limit for faster **FoXS** calculations
- Updated dependencies [1cfa2b1]
- Updated dependencies [02969d1]
  - @bilbomd/mongodb-schema@1.10.0
  - @bilbomd/md-utils@1.0.1

## 1.19.2

### Patch Changes

- d2152d8: Remove `environment.yml` from apps/worker
- 54283b0: Make sure largest rigid body becomes fixed.
- 361341d: Fix **BilboMD Auto** pipeline on hyperion when md_engine is `OpenMM`.
- 1574fa3: Add OpenMM ENV variables for runtime configuration of md settings

## 1.19.1

### Patch Changes

- 3a61d44: Update pnpm dependencies
- Updated dependencies [3a61d44]
  - @bilbomd/mongodb-schema@1.9.4

## 1.19.0

### Minor Changes

- 8cba652: Complete refactor of `pae_ratios.py`
  - Renamed to `pae2const.py`.
  - Added numerous CLI arguments to adjust the clustering behavior.
  - Improved ability to detect "weak" off-diagonal regions in the PAE matrix.

### Patch Changes

- 34c6f21: Update all deps
- Updated dependencies [34c6f21]
  - @bilbomd/mongodb-schema@1.9.3

## 1.18.6

### Patch Changes

- f17071f: move python `pae_ratios.py` script to tools/python
  move python `pdb2crd.py` script to tools/python
  move segid mol type util functions to `pdb_utils.py` script in tools/python

## 1.18.5

### Patch Changes

- 5e867df: remove CHARMM NTER patch

## 1.18.4

### Patch Changes

- a37ac24: Cleanup some of the Typescript errors encountered when turning on 'strict' is true.
- db8ebb2: Refactor `spawnPaeToConst` to handle new `pae_ratios.py` command line args/
  Adjust `apps/worker/scripts/nersc/gen-bilbomd-slurm-file.sh` to handle new `pa_ratios.py` command line args.

## 1.18.3

### Patch Changes

- dbe5618: Cleanup the node mailer code

## 1.18.2

### Patch Changes

- fb148b1: Fixes to `multi_foxs` steps for the NERSC deployment
  - adjust backend `getFoxsBilboData` to look in the `openmm/md` directory for results
  - adjust the worker `run-multifoxs.py` script to accept various command line args.
- 4e3b5a9: Fix nodemailer `defaultLayout` which should be a string NOT a boolean, but also must be defined otherwise you get `main` as your email template. So it seems we need to define it as an empty string so that we can override it later with our custom template.

## 1.18.1

### Patch Changes

- 8cc2f8f: fix a bug in the mailer that was hardcoding a boolean `false` as tthe literal template name for all emails. yuck!

## 1.18.0

### Minor Changes

- 05fc856: Refactoring to support `OpenMM` as th` `md_engine`.
  In particular this PR includes improvments to the Python script that runs on NERSC to prepare Slurm batch files.

### Patch Changes

- 76784b5: fix paths in `gen-openmm-slurm-file.py` script.

## 1.17.2

### Patch Changes

- 0c52175: Refactor `backend` job handlers to accept `md_engine` (CHARMM or OpenMM) and handle it appropriately.
  - Classic/PDB - accepts and adjusts steps accordingly
  - Classic/CRD - rejects and informs caller
  - Auto - accepts and adjusts steps accordingly
  - AF - accepts and adjusts steps accordingly

  Refactor `worker` pipeline code to handle `md_engine`
  - `apps/worker/src/services/pipelines/bilbomd-auto.ts` now accepts OpenMM
  - `apps/worker/src/services/functions/openmm-functions.ts` allows both `IBilboMDPDBJob` and `IBilboMDAutoJob` Job types.

- 88234e0: Add tests for helper functions. This required some changes to mailer and runPythonStep code

## 1.17.1

### Patch Changes

- 3158ff6: testing GitHub Action CI pipeline and teh ability to tag images with semver value.
- Updated dependencies [3158ff6]
  - @bilbomd/mongodb-schema@1.9.2

## 1.17.0

### Minor Changes

- d494d1f: This PR resulting in complete removal of BioXTAS and ATSAS as dependencies
