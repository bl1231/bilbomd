---
"@bilbomd/ui": minor
"@bilbomd/backend": minor
"@bilbomd/worker": minor
"@bilbomd/mongodb-schema": minor
---

**Add comprehensive OpenMM support with MD engine selection across the platform.**

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
