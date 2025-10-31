# @bilbomd/mongodb-schema

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
