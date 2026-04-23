# @bilbomd/worker

## 2.7.3

### Patch Changes

- 682fd84: Fix DNA/RNA residue handling in both CHARMM and OpenMM pipelines.

  OpenMM: `minimize.py` now calls `Modeller.addHydrogens(forcefield)` after PDBFixer so that DNA/RNA residues get all required hydrogen atoms (PDBFixer alone misses some, causing a "No template found" crash at system creation).

  CHARMM: `constraintUtils.ts` segment-ID mapping now correctly handles DNA/RNA chains. `parseInpConstraints` strips the mol-type prefix (PRO/DNA/RNA/CAR/CAL) to extract the real chain ID from pdb2crd segids (e.g. `DNAD` → `D`). `generateInpFromConstraints`/`convertYamlToInp` accept an optional `chainSegidMap` built by the new `buildChainSegidMap` utility, so YAML→INP conversion emits the correct segid for each chain instead of always defaulting to `PRO{chain}`.

- Updated dependencies [682fd84]
  - @bilbomd/md-utils@1.1.8

## 2.7.2

### Patch Changes

- 298405b: Fix dcd2pdb CHARMM scripts failing with fatal NBFIX error when reading CGenFF parameter files. Set bomlev -2 in dcd2pdb and dcd2pdb-sans templates to match the other MD step templates.

## 2.7.1

### Patch Changes

- a0acc15: build docker image from ghcr.io/bl1231/bilbomd-worker-base:0.0.8-dev5

## 2.7.0

### Minor Changes

- 33ec715: Replace legacy toppar directory with CHARMM-bundled toppar from the c49b2 build stage. Switch protein force field from CHARMM36 to CHARMM36m (par_all36m_prot.prm). Replace CGenFF auto-generated FAD parameters with peer-reviewed cofactors stream (Aleksandrov, J. Comput. Chem. 2019). No custom topology files remain in the repository.

## 2.6.5

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).
- Updated dependencies [57f8495]
  - @bilbomd/bilbomd-types@1.5.2
  - @bilbomd/md-utils@1.1.7
  - @bilbomd/mongodb-schema@2.5.4

## 2.6.4

### Patch Changes

- Updated dependencies [e24f1c6]
  - @bilbomd/mongodb-schema@2.5.3
  - @bilbomd/md-utils@1.1.6

## 2.6.3

### Patch Changes

- bf1837b: Replace npm-run-all with pnpm && chaining in all build scripts. Removes an unnecessary dependency that called npm run internally rather than pnpm run.

## 2.6.2

### Patch Changes

- 08cdf90: Strip metal ions (ZN, MG, CA, FE, etc.) from PDB chains before CHARMM pdb2crd conversion. Fixes job failure when PDB/CIF files contain ions that CHARMM's standard topology does not recognise. Ion-only chains are silently skipped rather than passed to CHARMM.

## 2.6.1

### Patch Changes

- ec69fcd: Replace hard-coded Python binary paths with configurable environment variables. `OPENMM_PYTHON_BIN` (default: `/opt/envs/openmm/bin/python`) and `BASE_PYTHON_BIN` (default: `/opt/envs/base/bin/python`) can now be set to override paths without rebuilding the container.
- 4923ccb: Add structured logging with JSON file output and request context propagation.

  File transports now emit JSON for machine-parseable log ingestion (Loki, Elasticsearch, etc.). Console output remains colorized human-readable text.

  Backend gains `AsyncLocalStorage`-based request context: every log line within an HTTP request automatically includes `requestId` without threading `req` through callers. Key controller call sites migrated from string interpolation to structured object fields.

- 7d8ebdc: Update all npm dependencies to latest minor/patch versions. Includes axios 1.15, bullmq 5.73.1, @bull-board 6.21, nodemailer 8.0.5, react 19.2.5, vite 8.0.7, vitest 4.1.3, turbo 2.9.5, and MUI 7.3.10.
- Updated dependencies [82d0bf4]
  - @bilbomd/mongodb-schema@2.5.2
  - @bilbomd/bilbomd-types@1.5.1
  - @bilbomd/md-utils@1.1.5

## 2.6.0

### Minor Changes

- f3ca090: Add support for mmCIF (.cif) file uploads in Classic/pdb and Auto job types.

  Users can now upload AlphaFold 3 (or any standard mmCIF) files directly into BilboMD without manual conversion. The frontend and backend validate chain IDs and residue names from the `_atom_site` loop block using the same `SUPPORTED_PDB_RESIDUES` allowlist used for PDB validation. The worker converts CIF to PDB at pipeline start using biopython before CHARMM or OpenMM processing.

### Patch Changes

- Updated dependencies [f3ca090]
  - @bilbomd/bilbomd-types@1.5.0

## 2.5.2

### Patch Changes

- d9a702d: Update all dependencies. Patch/minor bumps across the board: bullmq, dotenv, mongoose, eslint, molstar, react-router, msw, vite, sass-embedded, @types/node, turbo. Bump @types/nodemailer from ^7 to ^8 to match the already-upgraded nodemailer v8 runtime.
- Updated dependencies [d9a702d]
  - @bilbomd/md-utils@1.1.4
  - @bilbomd/mongodb-schema@2.5.1

## 2.5.1

### Patch Changes

- eeb1eed: Fix Dependabot PRs failing CI due to pnpm frozen lockfile mismatch. CI now skips --frozen-lockfile when the PR author is dependabot[bot].
- 48dfcdc: Fix three related bugs in the NERSC job submission and monitoring path.
  1. `makeBilboMDSlurm` was silently swallowing errors, allowing the pipeline to proceed to Slurm submission even when the batch file was never prepared.
  2. `submitBilboMDSlurm` was not validating the NERSC-returned job ID, writing `nersc.jobid = null` to MongoDB and marking the BullMQ job as completed — causing jobs to appear permanently stuck.
  3. The job monitor was calling `updateJobStepsFromSlurmStatusFile` for PENDING jobs, but `status.txt` does not exist until the Slurm job starts running, causing the monitor to mark healthy jobs as Error on every cycle.

- Updated dependencies [fc1be50]
  - @bilbomd/bilbomd-types@1.4.1

## 2.5.0

### Minor Changes

- 8849e8b: Standardize MD engine output directory layout across all pipelines and deployments.

  All OpenMM steps now write to `openmm/minimize/`, `openmm/heat/`, and `openmm/md/` (previously used a flat `minimize/`, `heat/`, `md/` layout locally, and `openmm/minimization/`, `openmm/heating/`, `openmm/md/` at NERSC). CHARMM layout (`charmm/minimize/`, `charmm/heat/`, `charmm/md/`) is unchanged.

  Also fixes a bug in `prepare-results.ts` where the NERSC OpenMM DAT file fallback path was identical to the local OpenMM path and would never find the NERSC file.

- 474cef7: Add results_ready flag to track results packaging outcome independently of job status.

  Jobs that complete all MD science steps but fail during final tar.gz creation now remain
  Completed rather than Failed. A new results_ready boolean field (false by default) is set
  to true only after a successful archive is created, making the packaging outcome observable.

  The UI disables the Download Results button and shows a warning when results_ready is false,
  and surfaces download errors to the user via an Alert instead of silently logging to console.

### Patch Changes

- Updated dependencies [474cef7]
  - @bilbomd/mongodb-schema@2.5.0
  - @bilbomd/bilbomd-types@1.4.0
  - @bilbomd/md-utils@1.1.3

## 2.4.4

### Patch Changes

- 0537640: Upgrade major npm dependencies: TypeScript 6.0, Vite 8, @vitejs/plugin-react 6, jsdom 29, @types/supertest 7.
  - Update `vite.config.ts` to use `rolldownOptions` (renamed from `rollupOptions` in Vite 8)
  - Fix `vi.mock` factory JSX hoisting incompatibility introduced by @vitejs/plugin-react 6
  - Update eslint-config peer dependency to accept TypeScript 5 or 6

- Updated dependencies [0537640]
  - @bilbomd/md-utils@1.1.2

## 2.4.3

### Patch Changes

- be1e0a5: Make SMTP mail settings fully configurable via environment variables. Adds support for `BILBOMD_MAILER_SECURE` (TLS toggle) and optional `BILBOMD_MAILER_USER`/`BILBOMD_MAILER_PASS` (SMTP auth) in all three apps. Worker and Scoper now respect `BILBOMD_MAILER_HOST` and `BILBOMD_MAILER_PORT` from env instead of hard-coded values. Existing deployments are unaffected — all new vars default to current behavior.

## 2.4.2

### Patch Changes

- 976468f: Fix OpenMM base dat file path so the minimized PDB FoXS result is correctly found and copied to results/. This restores the 1-state ensemble model in the FoXS Ensemble Chi² residuals chart for OpenMM jobs.

## 2.4.1

### Patch Changes

- c14c67c: Fix OpenMM base dat file path so the minimized PDB FoXS result is correctly found and copied to results/. This restores the 1-state ensemble model in the FoXS Ensemble Chi² residuals chart for OpenMM jobs.

## 2.4.0

### Minor Changes

- eab35ef: Improve worker code quality, maintainability, and performance. Consolidate duplicated progress tracking into a reusable helper function (reducing ~178 lines of code). Refactor handler switch statements to use configuration-driven approach for better maintainability. Remove module-level mutable state in favor of BullMQ's built-in metrics API. Parallelize NERSC job monitoring with concurrency limit of 10 for up to 10x performance improvement when processing multiple jobs.
- 5248e04: Enhance worker code quality with centralized configuration and comprehensive test coverage. Extract all magic numbers to config/constants.ts (worker concurrency, polling intervals, retry settings, progress calculation). Consolidate duplicated error handling into shared helpers/errors.ts utility. Add 100% test coverage for mongo-utils.ts and workerControl.ts, plus 63% coverage for job-utils.ts (39 new tests total). Improve runPythonStep.ts coverage from 88% to 92%. Remove dead/commented code across worker files.

### Patch Changes

- 5c22961: Improve worker reliability and error handling. Add graceful shutdown handling for SIGTERM/SIGINT signals to properly close workers and Redis connections. Implement connection retry logic for MongoDB (5 attempts with 5s delay) to handle transient connection failures. Add startup validation for required environment variables to fail-fast on misconfiguration. Include multimdWorker in pause/resume logic for NERSC token validation. Make error throwing explicit in all job handlers (bilboMd, multiMd, movie) to ensure BullMQ correctly marks failed jobs. Add comprehensive test coverage for config validation and worker handlers.

## 2.3.8

### Patch Changes

- a8a0abb: Add test coverage display to README
  - Add json-summary reporter to backend and worker vitest configs
  - Add json-summary reporter to UI vite config
  - Create coverage update script for GitHub Actions
  - Add coverage-report job to CI workflow
  - Add test coverage table to README with automatic updates on main branch pushes

- cebfddb: bump nodejs to v24.13.1
- 624082c: Fix TypeScript build errors related to schema type inference and ObjectId type handling. Added explicit type annotations to assetsSchema and resultsSchema to resolve BSON dependency issues. Updated worker and backend to properly handle user field as either ObjectId or populated IUser object.
- Updated dependencies [cebfddb]
- Updated dependencies [624082c]
- Updated dependencies [190fe68]
  - @bilbomd/mongodb-schema@2.4.1
  - @bilbomd/md-utils@1.1.1

## 2.3.7

### Patch Changes

- 4dab2a7: Update NERSC slurm python scripts to use `bilbomd-perlmutter-worker:0.0.29`

## 2.3.6

### Patch Changes

- e53e045: Hopefully fixed the pdb2crd upper/lowercase CAR CAL bug
- 7eeef80: changing MW_ERR_CUTOFF for the feedback script
- e497ffc: Apparently Python sets have non-deterministic iteration order. This was makign our `pdb2crd.py` script produce inconsistent results.

## 2.3.5

### Patch Changes

- 296a257: Make sure we use the full `pdb2crd_chain_` prefix

## 2.3.4

### Patch Changes

- 4a7803a: Fix bug where uppercase carbohydrate chain IDs were being treated as lowercase durin PDB to CRD conversion.

## 2.3.3

### Patch Changes

- 0e38e5a: Fix the dcd2pdb logic for BilboMD SANS jobs to look in `charmm/md` for `*.dcd` files.
- f4f450d: Fix initfox step to look in proper place for `minimization_output.pdb` file.
- d1823f6: Adjust workers to use new CHARMM subdirectory organization

## 2.3.2

### Patch Changes

- 55965cf: Fix error when trying to send email for anonymous jobs
  Add extra redundent `pae` step for slurm-generated `status.txt` files

## 2.3.1

### Patch Changes

- 4efba67: patch to handle both absolute Docker paths and relative paths
- c541a29: Update dependencies
- 27e0b76: Refactor the slurm gen scripts to create pipeline-specific `status.txt` files

## 2.3.0

### Minor Changes

- 6ce0ac6: Refactor NERSC Slurm prep script from bash to Python

### Patch Changes

- f34ba14: Add PDB remediate step for CHARMM jobs run on NERSC
- 8dd6c75: prepareResults now finds files in CHARMM subdirectories
- 92f78b0: Skip email for anonymous jobs on NERSC

## 2.2.1

### Patch Changes

- 340fb56: Fix bug #333 (AF outputs not preppped properly for pae2const)

## 2.2.0

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

## 2.1.5

### Patch Changes

- a0c6ed3: Add a docker base image for the worker.
- 1d0c4f5: Update nodejs
  Update pnpm
  Update all deps
  Fix some typescript errors that surfaced.
- Updated dependencies [1d0c4f5]
  - @bilbomd/mongodb-schema@2.3.5
  - @bilbomd/md-utils@1.0.20

## 2.1.4

### Patch Changes

- 0daf2a4: improved cicd pipeline
- Updated dependencies [0daf2a4]
  - @bilbomd/bilbomd-types@1.3.3
  - @bilbomd/md-utils@1.0.19
  - @bilbomd/mongodb-schema@2.3.4

## 2.1.3

### Patch Changes

- 34ef235: Update all dependencies with minor or patch level bumps
- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration
- Updated dependencies [34ef235]
- Updated dependencies [690bed9]
  - @bilbomd/md-utils@1.0.18
  - @bilbomd/bilbomd-types@1.3.2
  - @bilbomd/mongodb-schema@2.3.3

## 2.1.2

### Patch Changes

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

- Updated dependencies [16f7879]
  - @bilbomd/mongodb-schema@2.3.2
  - @bilbomd/bilbomd-types@1.3.1
  - @bilbomd/md-utils@1.0.17

## 2.1.1

### Patch Changes

- da97649: Refresh dependencies across the workspace to pick up recent bug fixes and minor improvements. No schema/API changes and no expected breaking changes.
  - Backend/Worker/Scoper: `bullmq@5.66`, `mongoose@8.20.3`, `winston@3.19`, `cron@4.4`
  - UI: `react@19.2.3`, `react-dom@19.2.3`, `@mui/x-data-grid@8.22`, `recharts@3.6`, `molstar@5.4.2`
  - Tooling: `vite@7.3`, `@vitejs/plugin-react@5.1.2`, `vite-tsconfig-paths@6.0.1`, `jsdom@27.3`, `sass-embedded@1.96`, `eslint@9.39.2`, `@typescript-eslint@8.50`, `@types/node@25`
  - Lint/tests: small cleanups to silence unused vars/imports in a few UI tests; no behavioral changes.

- Updated dependencies [da97649]
  - @bilbomd/mongodb-schema@2.3.1
  - @bilbomd/md-utils@1.0.16

## 2.1.0

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

## 2.0.9

### Patch Changes

- Updated dependencies [53937de]
  - @bilbomd/mongodb-schema@2.2.0
  - @bilbomd/md-utils@1.0.14

## 2.0.8

### Patch Changes

- 1c71d30: Update npm dependencies
- Updated dependencies [1c71d30]
  - @bilbomd/mongodb-schema@2.1.2
  - @bilbomd/md-utils@1.0.13

## 2.0.7

### Patch Changes

- b107fdb: Manually trigger patch to all packages
- Updated dependencies [b107fdb]
  - @bilbomd/md-utils@1.0.12
  - @bilbomd/mongodb-schema@2.1.1

## 2.0.6

### Patch Changes

- 3b0da23: Add Example Data option for Alphafold jobs
  Adjust all `config.ts` to support boolean toggles for pipeline availability
- 89c7d7b: [BUG] NERSC Alphafold jobs were using the wrong container

## 2.0.5

### Patch Changes

- 2ff4c96: Refactor `Scoper` results and steps to align with new DTO mindset
- Updated dependencies [bdc6d1d]
- Updated dependencies [2ff4c96]
  - @bilbomd/mongodb-schema@2.1.0
  - @bilbomd/md-utils@1.0.11

## 2.0.4

### Patch Changes

- a4082e0: update for CVE-2025-64756
- Updated dependencies [a4082e0]
  - @bilbomd/mongodb-schema@2.0.2
  - @bilbomd/md-utils@1.0.10

## 2.0.3

### Patch Changes

- 1d9457e: Add script to automatically sync the NERSC scripts from `bilbomd-worker` to CFS when SPIN image starts.

## 2.0.2

### Patch Changes

- 91ce282: Update the NERSC Slurm generation bash script.

## 2.0.1

### Patch Changes

- c417040: Update all pnpm dependencies
- Updated dependencies [c417040]
  - @bilbomd/mongodb-schema@2.0.1
  - @bilbomd/md-utils@1.0.9

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
  - @bilbomd/md-utils@1.0.8

## 1.24.3

### Patch Changes

- 2335ee6: Update license as per IPO
- 9f102df: fix the path logic when parsing `ensemble_size_N.txt` files (bug #199)
  consolodate `prepareResults` functions for several workflows
- Updated dependencies [2335ee6]
  - @bilbomd/md-utils@1.0.7
  - @bilbomd/mongodb-schema@1.12.2

## 1.24.2

### Patch Changes

- 3bad4a2: Use versioned OpenMM (v8.4.0) instead of `master` branch
  Pin CUDA to v12 for NERSC `bilbomd-openmm-worker` Docker image
- fce115a: Update nodejs and dependencies
- Updated dependencies [fce115a]
  - @bilbomd/md-utils@1.0.6

## 1.24.1

### Patch Changes

- 93da9d9: Use versioned OpenMM (v8.4.0) instead of `master` branch
- 578d870: Add LBL license
- Updated dependencies [578d870]
  - @bilbomd/md-utils@1.0.5
  - @bilbomd/mongodb-schema@1.12.1

## 1.24.0

### Minor Changes

- 3091aeb: Remove dedicated BullMQ queue to process PDB to CRD conversion.
  Add extra step in the worker to do conversion instead.

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
