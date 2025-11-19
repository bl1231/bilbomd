# @bilbomd/mongodb-schema

## 2.0.2

### Patch Changes

- a4082e0: update for CVE-2025-64756

## 2.0.1

### Patch Changes

- c417040: Update all pnpm dependencies

## 2.0.0

### Major Changes

- f514114: Allow public unauthenticated BilboMD job submission
  Add new public endpoints to `bilbomd-backend`
  Add Help component
  Add Cookie consent
  Add PublicJobPage to display job results for unauthenticated users
  Add Privacy Policy Component
  Add new shared `bilbomd-types` package for Typescript types/interfaces

## 1.12.2

### Patch Changes

- 2335ee6: Update license as per IPO

## 1.12.1

### Patch Changes

- 578d870: Add LBL license

## 1.12.0

### Minor Changes

- e110840: Add ability to make mp4 movies from Molecular Dynamics trajectory file (`*.dcd` files)
  Creates one mp4 moview per DCD file. Only implemented for OpenMM.
  Add movie gallery and viewer to Jobs result page in UI.
  Add PyMOL to the `bilbomd-worker-base` image

## 1.11.0

### Minor Changes

- 9d755b6: Add OpenMM params to MongoDB Job Schema
  Remove all `OMM_*` env variables from `.env.example`
  Remove all `OMM_*` env variables from `infra/helm/templates/bilbomd-configmaps.yaml`

## 1.10.0

### Minor Changes

- 1cfa2b1: Store `md_constraints` in mongodb

## 1.9.4

### Patch Changes

- 3a61d44: Update pnpm dependencies

## 1.9.3

### Patch Changes

- 34c6f21: Update all deps

## 1.9.2

### Patch Changes

- 3158ff6: testing GitHub Action CI pipeline and teh ability to tag images with semver value.
