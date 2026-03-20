# @bilbomd/backend

## 2.5.7

### Patch Changes

- 976468f: Fix OpenMM base dat file path so the minimized PDB FoXS result is correctly found and copied to results/. This restores the 1-state ensemble model in the FoXS Ensemble Chi² residuals chart for OpenMM jobs.
- 976468f: Refactor FoXS data layer: split downloadController into foxsController + foxsDataService + foxsParser, decouple business logic from HTTP, eliminate duplicate type definitions, add unit tests.

## 2.5.6

### Patch Changes

- c14c67c: Fix OpenMM base dat file path so the minimized PDB FoXS result is correctly found and copied to results/. This restores the 1-state ensemble model in the FoXS Ensemble Chi² residuals chart for OpenMM jobs.

## 2.5.5

### Patch Changes

- bb4c436: fix FoXS Analysis bug where the 1-state model is not being displayed.

## 2.5.4

### Patch Changes

- 6414ada: Fix FoXS Analysis tab not displaying 1-state ensemble correctly. Backend now sorts multi_state_model files numerically before serving, so filesystem order no longer affects the result. Frontend now derives ensemble size labels from the filename instead of the array index.

## 2.5.3

### Patch Changes

- bb0acc6: Fix critical security vulnerabilities and improve code quality. Replace unsafe environment variable fallbacks with getEnvVar() to prevent empty JWT/session secrets. Update all console.log statements to use winston logger for consistent structured logging. Remove JWT error exposure in API responses and fix inefficient code patterns.

## 2.5.2

### Patch Changes

- c4a1f47: Add comprehensive unit tests for verifyJWT and jobCleaner middleware functions
  - Add 9 tests for verifyJWT middleware covering authentication flows, error handling, and token validation
  - Add 9 tests for jobCleaner middleware covering database cleanup, filesystem operations, and error handling
  - Achieve 98.46% statement coverage and 87.5% branch coverage for middleware
  - All tests use proper TypeScript types with zero `any` usage

- a8a0abb: Add test coverage display to README
  - Add json-summary reporter to backend and worker vitest configs
  - Add json-summary reporter to UI vite config
  - Create coverage update script for GitHub Actions
  - Add coverage-report job to CI workflow
  - Add test coverage table to README with automatic updates on main branch pushes

- 73bde5f: Convert promise chains to async/await for better readability
  - Converted `.then()` chains to async/await in job controller files
  - Updated createJob.ts: replaced Promise.all().then() with separate await and reduce
  - Updated sansJobController.ts: replaced Promise.all().then() with separate await and reduce
  - Added comprehensive tests for job quota checking logic (6 tests, 100% passing)
  - Improves code readability by using modern async/await patterns instead of promise chaining

- cebfddb: bump nodejs to v24.13.1
- 624082c: Fix TypeScript build errors related to schema type inference and ObjectId type handling. Added explicit type annotations to assetsSchema and resultsSchema to resolve BSON dependency issues. Updated worker and backend to properly handle user field as either ObjectId or populated IUser object.
- 654aa2c: Refactor getJobs.ts to remove duplicate code and improve test coverage
  - Removed duplicate resolveUsername helper function (was defined twice in the same file)
  - Replaced console.log with proper logger.error in error handling
  - Added comprehensive test coverage for getAllJobs and getJobById functions (22 tests, 87% line coverage)
  - Fixed TypeScript type safety in test mocks

- Updated dependencies [cebfddb]
- Updated dependencies [624082c]
- Updated dependencies [190fe68]
  - @bilbomd/mongodb-schema@2.4.1
  - @bilbomd/md-utils@1.1.1

## 2.5.1

### Patch Changes

- c541a29: Update dependencies

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
  - @bilbomd/md-utils@1.1.0

## 2.4.3

### Patch Changes

- 1d0c4f5: Update nodejs
  Update pnpm
  Update all deps
  Fix some typescript errors that surfaced.
- Updated dependencies [1d0c4f5]
  - @bilbomd/mongodb-schema@2.3.5
  - @bilbomd/md-utils@1.0.20

## 2.4.2

### Patch Changes

- 0daf2a4: improved cicd pipeline
- Updated dependencies [0daf2a4]
  - @bilbomd/bilbomd-types@1.3.3
  - @bilbomd/md-utils@1.0.19
  - @bilbomd/mongodb-schema@2.3.4

## 2.4.1

### Patch Changes

- 34ef235: Update all dependencies with minor or patch level bumps
- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration
- 5570492: Update mongodb-memory-server to v11
- Updated dependencies [34ef235]
- Updated dependencies [690bed9]
  - @bilbomd/md-utils@1.0.18
  - @bilbomd/bilbomd-types@1.3.2
  - @bilbomd/mongodb-schema@2.3.3

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
  - @bilbomd/md-utils@1.0.17

## 2.3.1

### Patch Changes

- da97649: Refresh dependencies across the workspace to pick up recent bug fixes and minor improvements. No schema/API changes and no expected breaking changes.
  - Backend/Worker/Scoper: `bullmq@5.66`, `mongoose@8.20.3`, `winston@3.19`, `cron@4.4`
  - UI: `react@19.2.3`, `react-dom@19.2.3`, `@mui/x-data-grid@8.22`, `recharts@3.6`, `molstar@5.4.2`
  - Tooling: `vite@7.3`, `@vitejs/plugin-react@5.1.2`, `vite-tsconfig-paths@6.0.1`, `jsdom@27.3`, `sass-embedded@1.96`, `eslint@9.39.2`, `@typescript-eslint@8.50`, `@types/node@25`
  - Lint/tests: small cleanups to silence unused vars/imports in a few UI tests; no behavioral changes.

- Updated dependencies [da97649]
  - @bilbomd/mongodb-schema@2.3.1
  - @bilbomd/md-utils@1.0.16

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
  - @bilbomd/md-utils@1.0.15

## 2.2.0

### Minor Changes

- 53937de: Add optional charmm params to mongo job schema
  Add helper function in backend to calculate Rg range for md runs
  Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
  Enhance the `BilboMDJobDTO` to support richer information for MongoDB Detail component

### Patch Changes

- 03f9762: Add helper functions to resolve usernames of all jobs
- Updated dependencies [53937de]
  - @bilbomd/mongodb-schema@2.2.0
  - @bilbomd/bilbomd-types@1.3.0
  - @bilbomd/md-utils@1.0.14

## 2.1.4

### Patch Changes

- 9dbaa93: Fix bug in backend job filtering for non-admin users

## 2.1.3

### Patch Changes

- 1c71d30: Update npm dependencies
- Updated dependencies [1c71d30]
  - @bilbomd/mongodb-schema@2.1.2
  - @bilbomd/md-utils@1.0.13

## 2.1.2

### Patch Changes

- b107fdb: Manually trigger patch to all packages
- Updated dependencies [b107fdb]
  - @bilbomd/bilbomd-types@1.2.1
  - @bilbomd/md-utils@1.0.12
  - @bilbomd/mongodb-schema@2.1.1

## 2.1.1

### Patch Changes

- 3b0da23: Add Example Data option for Alphafold jobs
  Adjust all `config.ts` to support boolean toggles for pipeline availability
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
  - @bilbomd/md-utils@1.0.11

## 2.0.6

### Patch Changes

- a4082e0: update for CVE-2025-64756
- Updated dependencies [a4082e0]
  - @bilbomd/mongodb-schema@2.0.2
  - @bilbomd/md-utils@1.0.10

## 2.0.5

### Patch Changes

- 744b0d5: Fix bug in public SANS jobs where ip_hash not getting added to mongodb entry

## 2.0.4

### Patch Changes

- 009fac1: Bump `backend` to include tsconfig changes

## 2.0.3

### Patch Changes

- a591ec7: Use `bilbomd@lbl.gov` support email.
  Fix some broken tests
  Enable a bare bones minimal `/settings/safety` landing page for users to request account deletion.

## 2.0.2

### Patch Changes

- c417040: Update all pnpm dependencies
- Updated dependencies [c417040]
  - @bilbomd/mongodb-schema@2.0.1
  - @bilbomd/md-utils@1.0.9

## 2.0.1

### Patch Changes

- be9ac82: Change default prod cookie `sameSite` from `none` to `lax`

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
  - @bilbomd/md-utils@1.0.8

## 1.28.3

### Patch Changes

- 2335ee6: Update license as per IPO
- Updated dependencies [2335ee6]
  - @bilbomd/md-utils@1.0.7
  - @bilbomd/mongodb-schema@1.12.2

## 1.28.2

### Patch Changes

- fce115a: Update nodejs and dependencies
- Updated dependencies [fce115a]
  - @bilbomd/md-utils@1.0.6

## 1.28.1

### Patch Changes

- 578d870: Add LBL license
- Updated dependencies [578d870]
  - @bilbomd/md-utils@1.0.5
  - @bilbomd/mongodb-schema@1.12.1

## 1.28.0

### Minor Changes

- 3091aeb: Remove dedicated BullMQ queue to process PDB to CRD conversion.
  Add extra step in the worker to do conversion instead.

## 1.27.3

### Patch Changes

- 06d26e3: Purge old BilboMD Multi jobs
- 3e2f5b4: Update pnpm and dependencies
- Updated dependencies [3e2f5b4]
  - @bilbomd/md-utils@1.0.4

## 1.27.2

### Patch Changes

- Updated dependencies [e110840]
  - @bilbomd/mongodb-schema@1.12.0
  - @bilbomd/md-utils@1.0.3

## 1.27.1

### Patch Changes

- Updated dependencies [9d755b6]
  - @bilbomd/mongodb-schema@1.11.0
  - @bilbomd/md-utils@1.0.2

## 1.27.0

### Minor Changes

- 1cfa2b1: Store `md_constraints` in mongodb

### Patch Changes

- 8ad9b70: Implement charmm const to openmm const conversion & validation
  Implement openmm const to charmm const conversion & validation
- Updated dependencies [1cfa2b1]
- Updated dependencies [02969d1]
  - @bilbomd/mongodb-schema@1.10.0
  - @bilbomd/md-utils@1.0.1

## 1.26.3

### Patch Changes

- 54283b0: Make sure largest rigid body becomes fixed.
- 361341d: Fix **BilboMD Auto** pipeline on hyperion when md_engine is `OpenMM`.

## 1.26.2

### Patch Changes

- 3a61d44: Update pnpm dependencies
- Updated dependencies [3a61d44]
  - @bilbomd/mongodb-schema@1.9.4

## 1.26.1

### Patch Changes

- 8aa0093: Add pae_cutoff and leiden_resolution to PAE Jiffy

## 1.26.0

### Minor Changes

- 8cba652: Complete refactor of `pae_ratios.py`
  - Renamed to `pae2const.py`.
  - Added numerous CLI arguments to adjust the clustering behavior.
  - Improved ability to detect "weak" off-diagonal regions in the PAE matrix.

### Patch Changes

- aa20f7f: For got to add a changeset for removing --pae-power
- 3a183a5: Fixed `autorg.py` so it will handle SAXS dat files with extra stuff at the beginning or end.
- 34c6f21: Update all deps
- Updated dependencies [34c6f21]
  - @bilbomd/mongodb-schema@1.9.3

## 1.25.0

### Minor Changes

- 156f701: Added a visual feedback to PAE Jiffy.
  - Add new af2pae routes and controllers to the backend
  - Add new RTK Querys and slices to the frontend
  - Add new React Component to display the PAE matrix and the calculated const rigid/fixed regions.

## 1.24.2

### Patch Changes

- 67e9cb5: add biopython to backend docker image

## 1.24.1

### Patch Changes

- f17071f: move python `pae_ratios.py` script to tools/python
  move python `pdb2crd.py` script to tools/python
  move segid mol type util functions to `pdb_utils.py` script in tools/python

## 1.24.0

### Minor Changes

- c787560: Refactor the af2pae route and controller to use `pae_ratios.py` directly instead of queing to run the pdb2crd code in worker.

## 1.23.6

### Patch Changes

- dbe5618: Cleanup the node mailer code

## 1.23.5

### Patch Changes

- fb148b1: Fixes to `multi_foxs` steps for the NERSC deployment
  - adjust backend `getFoxsBilboData` to look in the `openmm/md` directory for results
  - adjust the worker `run-multifoxs.py` script to accept various command line args.
- 4e3b5a9: Fix nodemailer `defaultLayout` which should be a string NOT a boolean, but also must be defined otherwise you get `main` as your email template. So it seems we need to define it as an empty string so that we can override it later with our custom template.

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
