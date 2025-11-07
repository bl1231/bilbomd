# @bilbomd/scoper

## 1.5.5

### Patch Changes

- 895cff4: unpin IMP so that `bilbomd-scoper` Docker build will complete without errors

## 1.5.4

### Patch Changes

- 2335ee6: Update license as per IPO
- Updated dependencies [2335ee6]
  - @bilbomd/mongodb-schema@1.12.2

## 1.5.3

### Patch Changes

- fce115a: Update nodejs and dependencies

## 1.5.2

### Patch Changes

- 578d870: Add LBL license
- Updated dependencies [578d870]
  - @bilbomd/mongodb-schema@1.12.1

## 1.5.1

### Patch Changes

- 3e2f5b4: Update pnpm and dependencies

## 1.5.0

### Minor Changes

- 3a0f787: Changes needed to run Scoper on separate hardware from the rest of BilboMD

## 1.4.6

### Patch Changes

- Updated dependencies [e110840]
  - @bilbomd/mongodb-schema@1.12.0

## 1.4.5

### Patch Changes

- fad981e: I'm not sure how it happened, and don't have the time or wherewithall to do the forensics, but the BullMQ queue that the Scoper worker was subscribed to was `bilbomd-scoper`. It should be `scoper`. I fixed it.
  Also ran into an odd issue [issue](https://github.com/conda-forge/pytorch-cpu-feedstock/issues/350) with shared `libtorch_cpu.so` and the executable stack...Ended up switching docker file to build from `ubuntu:22.04` instead of `python:3.xx-slim`
- Updated dependencies [9d755b6]
  - @bilbomd/mongodb-schema@1.11.0

## 1.4.4

### Patch Changes

- 1cfa2b1: Store `md_constraints` in mongodb
- Updated dependencies [1cfa2b1]
  - @bilbomd/mongodb-schema@1.10.0

## 1.4.3

### Patch Changes

- 3a61d44: Update pnpm dependencies
- Updated dependencies [3a61d44]
  - @bilbomd/mongodb-schema@1.9.4

## 1.4.2

### Patch Changes

- 34c6f21: Update all deps
- Updated dependencies [34c6f21]
  - @bilbomd/mongodb-schema@1.9.3

## 1.4.1

### Patch Changes

- 3158ff6: testing GitHub Action CI pipeline and teh ability to tag images with semver value.
- Updated dependencies [3158ff6]
  - @bilbomd/mongodb-schema@1.9.2

## 1.4.0

### Minor Changes

- d494d1f: This PR resulting in complete removal of BioXTAS and ATSAS as dependencies
