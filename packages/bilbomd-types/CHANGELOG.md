# @bilbomd/bilbomd-types

## 1.9.0

### Minor Changes

- 7b71a98: Job step types now include each step's start time, finish time and duration, plus the steps they were missing (openfold, reduce, rnaview, kgs, ionnet, scoper). The public job status response now also returns the job title and a whitelisted set of inputs (input file names, MD parameters, Rg range and so on), which the redesigned job page will use. No user details are exposed.

## 1.8.1

### Patch Changes

- 9ea1c49: Fix two job-event bugs found on Spin dev. Anonymous jobs were published with an owner id of `"{}"` instead of none: their `user` is an empty nested object, which `jobEventOwnerId` stringified. It now accepts only a real 24-character ObjectId. And the NERSC job monitor published an event for every NERSC job on every pass, because rewriting a step with unchanged content gives it a new subdocument `_id`. Change detection now compares only each step's status and message.

## 1.8.0

### Minor Changes

- a785312: Deleting a job now stops it. The backend's delete worker removes any not-yet-started BullMQ entries for the job and publishes a cancel message on `JOB_CANCEL_CHANNEL`; the worker running it aborts the job's AbortSignal, which kills its current external process (TERM, then KILL) and makes any further tool calls fail immediately. Cancelled jobs fail with an `UnrecoverableError`, so BullMQ doesn't retry them, and deleting a job also cancels its movie renders.

  In the worker, each job runs in an `AsyncLocalStorage` context holding its signal and `runProcess` uses it by default, so no pipeline or step signatures change. BullMQ's own processor signal is honoured too. NERSC (Slurm) jobs and running SCOPER jobs are not cancelled yet.

- c335b0e: Add χ²free (Rambo & Tainer 2013) and volatility of ratio, Vr (Hura et al. 2013), to the FoXS fit results (beta). The backend computes both for the original model and every ensemble size from the fit curves it already serves, so existing completed jobs get them too. The UI shows a new "Fit quality" table with χ², χ²free and Vr per fit. Dmax is estimated as 3 × the Guinier Rg (there is no P(r) step yet), χ²free is the median over 1000 seeded random one-point-per-Shannon-channel subsets, and Vr uses q ≤ 0.3 Å⁻¹.
- ce062e3: Publish job update events from the rest of the job lifecycle, so pages that rely on the event stream stay current for every job type. The NERSC job monitor publishes one event per job whose status, progress, steps or NERSC state changed during a monitoring pass, and none for jobs that didn't change. The multi pipeline publishes when it starts, saves progress, fails or completes. SCOPER publishes from its step, progress and results updates and when a job starts or completes. The throttled publisher moves into `@bilbomd/bilbomd-types` as `createJobEventNotifier`, shared by the worker and SCOPER, and the SCOPER image now builds that package.
- b04d274: New jobs and MD movie progress now reach the browser without polling. The backend announces each newly submitted job (a `created` event), so the owner's job list, and every Admin's and Manager's, picks it up right away. The movie enqueuer and movie worker publish a `movies` event when movies are queued, start rendering, become ready or fail, and the job page refreshes its movies from it. While the stream is connected the job page polls movies only every 2 minutes instead of every 15 seconds.
- 910d809: Push job updates to the browser instead of relying on polling. The worker publishes a small "job changed" event on Redis (`JOB_EVENTS_CHANNEL`) whenever a job's status, a step, or its progress changes, throttled to about one event per second per job. The backend forwards those events to logged-in browsers over Server-Sent Events at `GET /api/v1/jobs/events`, filtered by the same access rule as the job endpoints, with a 25s heartbeat. The UI keeps one stream per tab and invalidates the changed jobs' RTK Query tags in batches, so the job page and the Jobs list refresh within a couple of seconds. While the stream is connected, pages poll only every 2 minutes as a safety net; if it drops they go back to their old intervals.

  Deleting a job no longer removes it from the list optimistically, or refetches right after the request. The request only queues the deletion, so the row shows "Deleting" with its actions disabled until the server confirms. The delete worker announces `deleted` once the document is gone, or `delete_failed` after its last attempt. The UI nginx config gets an unbuffered, uncached location for the stream.

## 1.7.0

### Minor Changes

- b337546: Add a dimensionless Kratky plot to the FoXS analysis panel. autorg.py now emits i0, rg_exact, r2, and qrg bounds alongside the existing Rg values; the backend attaches the Guinier fit (Rg, I0, fit window) to FoXS analysis responses, computing it on demand via autorg.py and caching the result as autorg.json in the job directory so existing completed jobs benefit without reprocessing. The UI renders a dimensionless Kratky chart ((qRg)²·I(q)/I(0) vs qRg) below the I(q) plots, overlaying the experimental curve with the original model and ensemble model curves, with reference crosshairs at the globular peak position (√3, 1.104).

## 1.6.1

### Patch Changes

- 6a693d2: Fix DNA representation consistency in Molstar viewer and add domain-based coloring.
  - #768: DNA now renders consistently as cartoon (tube/slab) for both CHARMM and OpenMM pipelines. The fix uses a residue-name-based selection that recognises standard PDB names (DA, DT, DG, DC) and CHARMM names (ADE, GUA, CYT, THY) explicitly.
  - #769: Add "Color by Domain" toggle button above the Molstar viewport. When active, fixed-body regions are colored blue and rigid-body regions orange, matching the PyMol movie scheme; flexible linkers retain the default chain coloring. The button appears whenever MD constraint data is available, independent of ensemble count.

## 1.6.0

### Minor Changes

- c2137eb: Add BilboMD OF3 pipeline using OpenFold3 for structure prediction.

  OpenFold3 replaces ColabFold as the structure predictor and supports Protein,
  DNA, and RNA chains simultaneously. The downstream OpenMM MD + FoXS + MultiFoXS
  pipeline is identical to BilboMD AF. Input is a JSON query file; the best sample
  is selected by `sample_ranking_score` from OpenFold3 confidence outputs.

## 1.5.4

### Patch Changes

- 964095e: Surface step progress messages on the public job page. The FoXS step now writes periodic progress text (e.g. "FoXS: 1800/3600 (50%)") to the MongoDB step message alongside the BullMQ update. The public job API now includes steps data, and the public job progress box displays the latest step message below the progress bar.

## 1.5.3

### Patch Changes

- d0504b0: Fix UI cofactor alerts to reflect GAFF2 support for organic small molecules. Split STRIPPABLE_COFACTORS into GAFF_COFACTORS (organic, now parameterized via GAFF2) and METAL_COFACTORS (heme/porphyrins, still removed). FAD and similar molecules now show a blue info alert instead of a yellow warning.

## 1.5.2

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).

## 1.5.1

### Patch Changes

- 82d0bf4: Remove md_engine from base job schema for scoper jobs. Scoper uses KGSRNA for
  conformational sampling, not CHARMM or OpenMM. Moving md_engine to only the
  discriminator schemas that use an MD engine (pdb, crd, auto, alphafold, sans).
  Also adds md_engine explicitly to the SANS discriminator schema where it was
  previously relying on the base schema default. The md_engine field is now
  optional in BaseJobDTO and AnonJobResponse.

## 1.5.0

### Minor Changes

- f3ca090: Add support for mmCIF (.cif) file uploads in Classic/pdb and Auto job types.

  Users can now upload AlphaFold 3 (or any standard mmCIF) files directly into BilboMD without manual conversion. The frontend and backend validate chain IDs and residue names from the `_atom_site` loop block using the same `SUPPORTED_PDB_RESIDUES` allowlist used for PDB validation. The worker converts CIF to PDB at pipeline start using biopython before CHARMM or OpenMM processing.

## 1.4.1

### Patch Changes

- fc1be50: Move the supported PDB residue list to a single constant (`SUPPORTED_PDB_RESIDUES`) in `@bilbomd/bilbomd-types`, shared by both the backend validator and the frontend `hasAllowedResiduesOnly` check. Eliminates the risk of the two lists diverging silently. Also adds common ions (MG, CA, ZN, etc.) and HSD to the allowed set, and adds the missing `pdbCheck()` to the Auto job form schema.

## 1.4.0

### Minor Changes

- 474cef7: Add results_ready flag to track results packaging outcome independently of job status.

  Jobs that complete all MD science steps but fail during final tar.gz creation now remain
  Completed rather than Failed. A new results_ready boolean field (false by default) is set
  to true only after a successful archive is created, making the packaging outcome observable.

  The UI disables the Download Results button and shows a warning when results_ready is false,
  and surfaces download errors to the user via an Alert instead of silently logging to console.

## 1.3.3

### Patch Changes

- 0daf2a4: improved cicd pipeline

## 1.3.2

### Patch Changes

- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration

## 1.3.1

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

## 1.3.0

### Minor Changes

- 53937de: Add optional charmm params to mongo job schema
  Add helper function in backend to calculate Rg range for md runs
  Replace the per-job Rg range calculation with the pre-calculated Rg range from Mongo Job document
  Enhance the `BilboMDJobDTO` to support richer information for MongoDB Detail component

## 1.2.1

### Patch Changes

- b107fdb: Manually trigger patch to all packages

## 1.2.0

### Minor Changes

- bdc6d1d: Implement structured Data Transfer Object (DTO) to decouple mongodb entries from frontend logic.
  Added a new package for shared types `bilbomd-types`.
  Added `results` to MongoDB Job schema.
  Extensive refactoring of `ui` React components.

### Patch Changes

- 2ff4c96: Refactor `Scoper` results and steps to align with new DTO mindset

## 1.1.0

### Minor Changes

- f514114: Allow public unauthenticated BilboMD job submission
  Add new public endpoints to `bilbomd-backend`
  Add Help component
  Add Cookie consent
  Add PublicJobPage to display job results for unauthenticated users
  Add Privacy Policy Component
  Add new shared `bilbomd-types` package for Typescript types/interfaces
