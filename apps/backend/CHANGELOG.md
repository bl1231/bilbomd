# @bilbomd/backend

## 1.23.4

### Patch Changes

- 8cc2f8f: fix a bug in the mailer that was hardcoding a boolean `false` as tthe literal template name for all emails. yuck!

## 1.23.3

### Patch Changes

- a56cf6a: Make backend and ui more resilient to missing FoXS data files.
  Added a utility bash script for fetching the latest semver tags for all the bilbomd apps.

## 1.23.2

### Patch Changes

- 0c52175: Refactor `backend` job handlers to accept `md_engine` (CHARMM or OpenMM) and handle it appropriately.
  - Classic/PDB - accepts and adjusts steps accordingly
  - Classic/CRD - rejects and informs caller
  - Auto - accepts and adjusts steps accordingly
  - AF - accepts and adjusts steps accordingly

  Refactor `worker` pipeline code to handle `md_engine`
  - `apps/worker/src/services/pipelines/bilbomd-auto.ts` now accepts OpenMM
  - `apps/worker/src/services/functions/openmm-functions.ts` allows both `IBilboMDPDBJob` and `IBilboMDAutoJob` Job types.

## 1.23.1

### Patch Changes

- 3158ff6: testing GitHub Action CI pipeline and teh ability to tag images with semver value.
- Updated dependencies [3158ff6]
  - @bilbomd/mongodb-schema@1.9.2

## 1.23.0

### Minor Changes

- d494d1f: This PR resulting in complete removal of BioXTAS and ATSAS as dependencies
