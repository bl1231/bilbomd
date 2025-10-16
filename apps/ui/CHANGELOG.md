# @bilbomd/ui

## 1.23.5

### Patch Changes

- Updated dependencies [9d755b6]
  - @bilbomd/mongodb-schema@1.11.0

## 1.23.4

### Patch Changes

- 02969d1: update deps and try to sort out typescript issues
- Updated dependencies [1cfa2b1]
  - @bilbomd/mongodb-schema@1.10.0

## 1.23.3

### Patch Changes

- Updated dependencies [3a61d44]
  - @bilbomd/mongodb-schema@1.9.4

## 1.23.2

### Patch Changes

- 32d385f: Added a pLDDT plot to the PAE Jiffy visualization component
  improved the performance by memoizing the PAE matrix canvas
  Implemented a few improvements to the cluster toggle overlay visualizations
- 8aa0093: Add pae_cutoff and leiden_resolution to PAE Jiffy

## 1.23.1

### Patch Changes

- 35cf6b9: The new `pae2const.py` does not support `--pae-power` so we will hide it.
- d5c73d2: Add `PAEMatrixPlotExplanation` with structured educational content to help users interpret teh PAE matrix.
- 34c6f21: Update all deps
- Updated dependencies [34c6f21]
  - @bilbomd/mongodb-schema@1.9.3

## 1.23.0

### Minor Changes

- 156f701: Added a visual feedback to PAE Jiffy.
  - Add new af2pae routes and controllers to the backend
  - Add new RTK Querys and slices to the frontend
  - Add new React Component to display the PAE matrix and the calculated const rigid/fixed regions.

## 1.22.2

### Patch Changes

- a56cf6a: Make backend and ui more resilient to missing FoXS data files.
  Added a utility bash script for fetching the latest semver tags for all the bilbomd apps.

## 1.22.1

### Patch Changes

- 3158ff6: testing GitHub Action CI pipeline and teh ability to tag images with semver value.
- Updated dependencies [3158ff6]
  - @bilbomd/mongodb-schema@1.9.2

## 1.22.0

### Minor Changes

- d494d1f: This PR resulting in complete removal of BioXTAS and ATSAS as dependencies
