# @bilbomd/ui

## 2.6.5

### Patch Changes

- 267894b: Refactor sidebar nav to use group-based dividers. Dividers are now structural separators between item groups (navigation, job forms, utilities, info) rather than properties on individual items, so filtering items like Scoper, SANS, or Multi no longer removes adjacent dividers.

## 2.6.4

### Patch Changes

- 32a084e: Disable CRD/PSF input toggle when CHARMM engine is disabled. When ENABLE_CHARMM_ENGINE=false, the CRD/PSF mode checkbox is now greyed out alongside the CHARMM md_engine option since CRD/PSF inputs are only used with CHARMM.
- 906e57a: Hide Scoper sidebar item when ENABLE_BILBOMD_SCOPER is false.

## 2.6.3

### Patch Changes

- 8a65390: Add `ENABLE_CHARMM_ENGINE` env var to allow deployments to disable the CHARMM md_engine option in all job forms. When set to `false`, the CHARMM radio button is disabled and forms default to OpenMM.

## 2.6.2

### Patch Changes

- 6414ada: Fix FoXS Analysis tab not displaying 1-state ensemble correctly. Backend now sorts multi_state_model files numerically before serving, so filesystem order no longer affects the result. Frontend now derives ensemble size labels from the filename instead of the array index.

## 2.6.1

### Patch Changes

- 0b7440c: Add comprehensive test coverage for Phase 1 critical business logic (API slices and state management). Achieves 100% coverage on authSlice, alphafoldPaeVizSlice, sfapiSlice, and bullmqApiSlice, plus 95.65% on apiSlice including base query reauth logic.
- 0b7440c: Add test coverage for Phase 2 job management components (partial). Achieves 100% coverage on JobDBDisplayProperties, JobError, and JobSuccessAlert components with comprehensive unit and integration tests.
- 0b7440c: Add test coverage for additional Phase 2 job management components. Achieves 100% coverage on JobDetails, BilboMDStep, and NewJobFormInstructions with comprehensive user interaction and accessibility tests.
- 0b7440c: Add comprehensive test coverage for Phase 2 job management components (batch 4). Achieves 256 total tests across 11 files with high coverage on JobActionsMenu (100%), FoXSAnalysis (94.28%), BilboMDNerscSteps (100%), BilboMDMongoSteps (100%), and BilboMDNerscStep (71.87%). Tests cover NERSC step workflows, FoXS data processing, job action menus, and complex data transformations.

## 2.6.0

### Minor Changes

- 45825fb: Add comprehensive TypeScript types to RTK Query endpoints. Previously, 36 out of 69 RTK Query endpoints (52%) lacked explicit type parameters, causing result types to default to `any` and bypass TypeScript's type safety. This change adds proper generic type parameters `<ResultType, ArgType>` to all untyped endpoints across authApiSlice, configsApiSlice, statsApiSlice, adminApiSlice, usersApiSlice, and jobsApiSlice. Benefits include compile-time type safety, better IDE autocomplete, and self-documenting API contracts.

### Patch Changes

- f8df12b: Fix job submission error by correcting API response type handling. The job creation endpoints return a flat response structure with jobid, uuid, and md_engine fields, but the frontend was expecting a nested BilboMDJobDTO structure. Added JobCreationResponse interface and updated all job form components to handle the correct response structure.

## 2.5.4

### Patch Changes

- 4128024: Remove dead code and debug statements to improve code quality. Removed unused nerscAdapter and initialState, active debug console.log statements, and commented-out console.log statements across multiple components.

## 2.5.3

### Patch Changes

- a8a0abb: Add test coverage display to README
  - Add json-summary reporter to backend and worker vitest configs
  - Add json-summary reporter to UI vite config
  - Create coverage update script for GitHub Actions
  - Add coverage-report job to CI workflow
  - Add test coverage table to README with automatic updates on main branch pushes

- cebfddb: bump nodejs to v24.13.1
- 40504d9: Fix bug with NERSC Run Time showing invalid
- 4917c41: Fix React Fast Refresh linting warnings in Molstar Viewport by separating component exports from non-component exports into separate files
- Updated dependencies [cebfddb]
- Updated dependencies [624082c]
  - @bilbomd/mongodb-schema@2.4.1

## 2.5.2

### Patch Changes

- cbf125a: Display the NERSC System Status rather than Notes in the tooltip

## 2.5.1

### Patch Changes

- c541a29: Update dependencies
- bbb3c2e: Fix bug in NERSC Queue Time and Run Time calculations that was resulting in negative values

## 2.5.0

### Minor Changes

- 673e173: Bump Node.js from v22 to v24

### Patch Changes

- 72f4ea4: Update dependencies.
  Improve pipeline instructions.
  Update instructions to reference OpenMM in addition to CHARMM.
- Updated dependencies [72f4ea4]
- Updated dependencies [673e173]
  - @bilbomd/mongodb-schema@2.4.0

## 2.4.7

### Patch Changes

- 3ac5725: Update Terms and Conditions, Privacy, and Copyright as per LBNL IPO.
- 1d0c4f5: Update nodejs
  Update pnpm
  Update all deps
  Fix some typescript errors that surfaced.
- Updated dependencies [1d0c4f5]
  - @bilbomd/mongodb-schema@2.3.5

## 2.4.6

### Patch Changes

- 0daf2a4: improved cicd pipeline
- Updated dependencies [0daf2a4]
  - @bilbomd/bilbomd-types@1.3.3
  - @bilbomd/mongodb-schema@2.3.4

## 2.4.5

### Patch Changes

- 34ef235: Update all dependencies with minor or patch level bumps
- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration
- Updated dependencies [690bed9]
  - @bilbomd/bilbomd-types@1.3.2
  - @bilbomd/mongodb-schema@2.3.3

## 2.4.4

### Patch Changes

- cec10f2: Add `md_engine` to the Jobs table.

## 2.4.3

### Patch Changes

- 955c712: Add tests for RTK Query

## 2.4.2

### Patch Changes

- f3afd62: Fix `Rg` validation issue for example data. `rg` must be defined.

## 2.4.1

### Patch Changes

- fe076f2: Prevent users from selecting values from `num_conf` pulldown when `OpenMM` is the `md_engine`

## 2.4.0

### Minor Changes

- 16f7879: # Usage Analytics & Admin Dashboard

  **Branch:** `238-store-job-stats-in-mongodb`
  **Target:** `main`

  ## 🎯 Core Feature: Usage Analytics & Admin Dashboard

  Added comprehensive usage analytics infrastructure across the BilboMD stack:
  - **📊 Analytics Dashboard:** New admin UI with interactive charts and KPI cards displaying job success rates, pipeline trends, duration statistics, and access mode splits
  - **📝 Usage Event Tracking:** Job lifecycle events (submitted/started/completed/failed) stored in MongoDB with user context, IP hashing, and NERSC metadata
  - **🔌 Backend Analytics API:** Protected endpoints for aggregating usage statistics with role-based access control (Admin/Manager only)
  - **⚡ Worker Pipeline Integration:** All job pipelines (auto/crd/pdb/sans/multi/scoper) now emit structured usage events

  ## 🏗️ Technical Implementation

  ### Database & Schema
  - New `UsageEvent` MongoDB collection with optimized indexes for analytics queries
  - Usage event interfaces and DTOs in shared packages

  ### Backend
  - 9 new analytics controller endpoints under `/admin/analytics`
  - Usage event service for centralized event recording
  - Job submission tracking for both authenticated and anonymous users

  ### Frontend
  - New RTK Query `analyticsApiSlice` for data fetching
  - Responsive analytics dashboard with time-range filtering
  - Complete test coverage for all analytics components

  ### Worker & Services
  - Usage event emission across all pipeline services
  - NERSC job monitoring with status tracking

  ## 🧪 Testing & Quality
  - **Comprehensive test suite** for all new analytics components
  - **Unit tests** for utility functions (dates, PDB utilities)
  - **Component tests** using Vitest with proper mocking patterns
  - **Follows project standards** with functional components and TypeScript strict typing

  ## 📚 Documentation
  - Usage analytics aggregation guide with MongoDB pipeline examples
  - Updated Copilot instructions with testing best practices
  - Detailed changeset documentation for future reference

### Patch Changes

- Updated dependencies [16f7879]
  - @bilbomd/mongodb-schema@2.3.2
  - @bilbomd/bilbomd-types@1.3.1

## 2.3.2

### Patch Changes

- 9ab656e: Enforce `CHARMM` for BilboMD Classic with CRD/PSF inputs

## 2.3.1

### Patch Changes

- da97649: Refresh dependencies across the workspace to pick up recent bug fixes and minor improvements. No schema/API changes and no expected breaking changes.
  - Backend/Worker/Scoper: `bullmq@5.66`, `mongoose@8.20.3`, `winston@3.19`, `cron@4.4`
  - UI: `react@19.2.3`, `react-dom@19.2.3`, `@mui/x-data-grid@8.22`, `recharts@3.6`, `molstar@5.4.2`
  - Tooling: `vite@7.3`, `@vitejs/plugin-react@5.1.2`, `vite-tsconfig-paths@6.0.1`, `jsdom@27.3`, `sass-embedded@1.96`, `eslint@9.39.2`, `@typescript-eslint@8.50`, `@types/node@25`
  - Lint/tests: small cleanups to silence unused vars/imports in a few UI tests; no behavioral changes.

- a572783: Improved layout and feedback for jobs submitted anonymously.
- 321d808: Remove @ant-design/colors dependency from UI
- Updated dependencies [da97649]
  - @bilbomd/mongodb-schema@2.3.1

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

### Patch Changes

- Updated dependencies [5145c75]
  - @bilbomd/mongodb-schema@2.3.0

## 2.2.0

### Minor Changes

- 53937de: Add optional charmm params to mongo job schema
  Add helper function in backend to calculate Rg range for md runs
  Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
  Enhance the `BilboMDJobDTO` to support richer information for MongoDB Detail component

### Patch Changes

- Updated dependencies [53937de]
  - @bilbomd/mongodb-schema@2.2.0
  - @bilbomd/bilbomd-types@1.3.0

## 2.1.3

### Patch Changes

- 1c71d30: Update npm dependencies
- Updated dependencies [1c71d30]
  - @bilbomd/mongodb-schema@2.1.2

## 2.1.2

### Patch Changes

- b107fdb: Manually trigger patch to all packages
- Updated dependencies [b107fdb]
  - @bilbomd/bilbomd-types@1.2.1
  - @bilbomd/mongodb-schema@2.1.1

## 3.0.0

### Major Changes

- 3b0da23: Add Example Data option for Alphafold jobs
  Adjust all `config.ts` to support boolean toggles for pipeline availability

### Patch Changes

- 6611da5: Add nginx config for proper ip address tracking in req.headers

## 2.1.0

### Minor Changes

- bdc6d1d: Implement structured Data Transfer Object (DTO) to decouple mongodb entries from frontend logic.
  Added a new package for shared types `bilbomd-types`.
  Added `results` to MongoDB Job schema.
  Extensive refactoring of `ui` React components.

### Patch Changes

- 2ff4c96: Refactor `Scoper` results and steps to align with new DTO mindset
- Updated dependencies [bdc6d1d]
- Updated dependencies [2ff4c96]
  - @bilbomd/mongodb-schema@2.1.0
  - @bilbomd/bilbomd-types@1.2.0

## 2.0.6

### Patch Changes

- a4082e0: update for CVE-2025-64756
- Updated dependencies [a4082e0]
  - @bilbomd/mongodb-schema@2.0.2

## 2.0.5

### Patch Changes

- 6846821: Remove some deprecated Typescript config settings in prep for Typescript 6.x
  This required a bit of fiddling with `bilbomd-ui` types and interfaces

## 2.0.4

### Patch Changes

- a591ec7: Use `bilbomd@lbl.gov` support email.
  Fix some broken tests
  Enable a bare bones minimal `/settings/safety` landing page for users to request account deletion.

## 2.0.3

### Patch Changes

- c417040: Update all pnpm dependencies
- Updated dependencies [c417040]
  - @bilbomd/mongodb-schema@2.0.1

## 2.0.2

### Patch Changes

- 0ccfbb3: Add `Help` to the main layout/routes
  Added a Back button to User Settings Nav drawer

## 2.0.1

### Patch Changes

- 899b5ce: Added pipeline figures to the Help page.

## 2.0.0

### Major Changes

- f514114: Allow public unauthenticated BilboMD job submission
  Add new public endpoints to `bilbomd-backend`
  Add Help component
  Add Cookie consent
  Add PublicJobPage to display job results for unauthenticated users
  Add Privacy Policy Component
  Add new shared `bilbomd-types` package for Typescript types/interfaces

### Patch Changes

- Updated dependencies [f514114]
  - @bilbomd/mongodb-schema@2.0.0
  - @bilbomd/bilbomd-types@1.1.0

## 1.24.5

### Patch Changes

- dcad9a1: Update GitHub link in footer of UI
- 2335ee6: Update license as per IPO
- Updated dependencies [2335ee6]
  - @bilbomd/mongodb-schema@1.12.2

## 1.24.4

### Patch Changes

- fce115a: Update nodejs and dependencies

## 1.24.3

### Patch Changes

- 578d870: Add LBL license
- Updated dependencies [578d870]
  - @bilbomd/mongodb-schema@1.12.1

## 1.24.2

### Patch Changes

- ef1f18f: Add simple component to display `md_constraints` if present
  Adjust CSS FlexBox for SingleJobPage
  Adjust CSS for cluster checkboxes in PAE Jiffy

## 1.24.1

### Patch Changes

- 3e2f5b4: Update pnpm and dependencies

## 1.24.0

### Minor Changes

- e110840: Add ability to make mp4 movies from Molecular Dynamics trajectory file (`*.dcd` files)
  Creates one mp4 moview per DCD file. Only implemented for OpenMM.
  Add movie gallery and viewer to Jobs result page in UI.
  Add PyMOL to the `bilbomd-worker-base` image

### Patch Changes

- dc30f9c: Make BilboMD Job step names more generic in order to support **CHARMM** and **OpenMM** equally
- Updated dependencies [e110840]
  - @bilbomd/mongodb-schema@1.12.0

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
