# @bilbomd/mongodb-schema

## 2.3.0

### Minor Changes

- 5145c75: **Add comprehensive OpenMM support with MD engine selection across the platform.**

  ## Frontend (UI)
  - Add `MdEngineField` component with CHARMM/OpenMM radio button selector
  - Integrate MD engine selection into all job forms: Classic PDB/CRD, Auto, AlphaFold, and SANS
  - Update form schemas with `md_engine` validation (Yup schema enforcement)
  - Add TypeScript types for `md_engine` field across all job form interfaces
  - Include comprehensive unit tests for MD engine selector component and form integration
  - Fix Vitest coverage configuration with setup file and proper Turbo integration

  ## Backend
  - Extend job controllers to handle `md_engine` parameter and route to appropriate parameter builders
  - Add OpenMM and CHARMM parameter building utilities for SANS jobs
  - Update job DTO mapping to include MD engine information
  - Add comprehensive test coverage for new job handling logic

  ## Worker
  - Enhance SANS pipeline to support both CHARMM and OpenMM execution paths
  - Update SANS functions with engine-specific parameter handling and execution logic
  - Implement OpenMM-specific molecular dynamics simulation workflows

  ## Schema & Types
  - Create dedicated SANS job interface (`IBilboMDSANSJob`) with engine-specific parameters
  - Add `md_engine` field to base job interfaces and MongoDB schema
  - Support for both `charmm_parameters` and `openmm_parameters` in job documents
  - Include deuteration fraction handling and SANS-specific fields

  ## Infrastructure
  - Update Helm production values for deployment configuration
  - Add comprehensive test fixtures and validation for new functionality

  This enables users to choose between CHARMM and OpenMM molecular dynamics engines across all BilboMD job types, with full backend processing support and comprehensive test coverage.

## 2.2.0

### Minor Changes

- 53937de: Add optional charmm params to mongo job schema
  Add helper function in backend to calculate Rg range for md runs
  Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
  Enhance the `BilboMDJobDTO` to support richer information for MongoDB Detail component

## 2.1.2

### Patch Changes

- 1c71d30: Update npm dependencies

## 2.1.1

### Patch Changes

- b107fdb: Manually trigger patch to all packages

## 2.1.0

### Minor Changes

- bdc6d1d: Implement structured Data Transfer Object (DTO) to decouple mongodb entries from frontend logic.
  Added a new package for shared types `bilbomd-types`.
  Added `results` to MongoDB Job schema.
  Extensive refactoring of `ui` React components.

### Patch Changes

- 2ff4c96: Refactor `Scoper` results and steps to align with new DTO mindset

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
