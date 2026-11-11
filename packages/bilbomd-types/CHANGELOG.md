# @bilbomd/bilbomd-types

## 1.17.0

### Minor Changes

- 7a201ae: The job forms now run two structure checks that only the backend ran before, so users see these problems when they pick their files instead of after they submit:

  - A PDB with residues that share a chain and residue number (for example, a glycan numbered inside the protein's range) is rejected, with the same message as the backend. This applies to the Classic, Auto and SANS forms.
  - On the Auto form (new and resubmit), a PAE matrix whose size doesn't match the structure's residue count is rejected, with the same message as the backend. Each PAE and structure file is read and parsed once, not on every form change.

  The residue counting, PAE parsing and both messages moved from the backend into `@bilbomd/bilbomd-types`, so the form and the backend use the same code.

- 789e456: Share the structure and constraint file checks between the job forms and the backend upload validation, so a file the form accepts is one the backend accepts too. The checks now live in `@bilbomd/bilbomd-types` (`structureFileChecks.ts`).

  Behaviour that now matches on both sides:

  - Constraint files accept only `shape desc` lines (the form used to accept any `shape` line), and the backend now enforces the form's limit of 20 shape commands.
  - The form no longer accepts lowercase residue names (the backend already rejected them), and no longer flags a blank residue name. A supported residue written in lowercase, such as `ala`, now gets its own message on both sides asking for uppercase names, instead of "unsupported residue".
  - Only `MODEL` records count as models in the form, not other lines starting with `MODEL`.
  - The form now checks an empty structure or constraint file (and one that cannot be read) instead of passing it.

## 1.16.0

### Minor Changes

- 4722901: Stop showing a MultiFoXS ensemble as the "Original Model" on the FoXS Analysis tab.

  - Each entry in the FoXS data response now has a `kind`: `original`, `ensemble` or `scoper`.
  - BioEmu2 jobs have no starting model, so the UI used to show the 1-state ensemble as the "Original Model" (with c1/c2 `unk`) and leave it out of the ensemble charts. Those jobs now show no Original Model chart. The ensemble charts take the full width and include every ensemble size.
  - The Dimensionless Kratky legend and the Fit quality table also use `kind` to decide which curve is the original model.

## 1.15.0

### Minor Changes

- 02e4873: Fix and restructure the SAXS fit assessment behind the Feedback & Validation tab.

  - Model molecular weight no longer drops segments that share a chain letter and residue numbers (protein–DNA complexes were under-counted).
  - The SAXS molecular weight now uses the published Rambo–Tainer volume-of-correlation method, and the comparison is advisory: a mismatch no longer replaces the fit assessment.
  - The assessment no longer fails when a model PDB is empty or missing, when the data end below q = 0.2 Å⁻¹, or with ten or more ensemble sizes.
  - `feedback.json` and `Job.feedback` gain `version`, `findings`, `regions`, `models` and `mw`; the existing fields remain, and the molecular-weight fields can now be null.

- 9c8ab24: Compare the model's mass with the SAXS data before a job is submitted.

  - New `POST /mw-check` endpoint: takes the SAXS file and a PDB, a PSF or sequences, and returns the same molecular-weight comparison as a finished job's report.
  - The Classic (PDB and CRD/PSF), Auto, AlphaFold, OpenFold3, BioEmu2 and Scoper forms show the result above the submit button as soon as both the data and the model are present. It is advisory and never blocks submission.
  - Model mass is now counted from residues rather than listed atoms, so a structure without hydrogens is not read about 7% light. The finished-job report uses the same count.

## 1.14.1

### Patch Changes

- 4dc5ad6: Show the submitted sequences in the "Inputs & parameters" section of the job page for AlphaFold, OpenFold3 and BioEmu2 jobs: name, type, copies and length per molecule, the sequence in numbered blocks of ten, copy buttons (one sequence, or everything as FASTA) and the total size counting copies. Shared results pages show them too.

## 1.14.0

### Minor Changes

- f3ff0ec: Add the BilboMD BioEmu2 pipeline (bilbomd#1200, step 1: API only, no UI form yet). Submitting sequence entities and SAXS data to `POST /jobs/bilbomd-bioemu` runs AutoRg, then Rg-steered BioEmu2 sampling in the new `bioemu2-service` in place of MD, then FoXS and MultiFoXS. The members of the best ensembles are then polished with a restrained OpenMM minimization. The pipeline is behind `ENABLE_BILBOMD_BIOEMU` and open to Admins only, with a system-size limit (`BIOEMU_MAX_TOKENS`, default 1,000).
- f3ff0ec: Show BilboMD BioEmu2 jobs on the job page (bilbomd#1200): the BioEmu2 job type, its Rg targets and structure counts, the `bioemu` and `polish` steps in pipeline order, and FoXS and feedback tabs (no movies, since BioEmu2 samples aren't a trajectory). There is no submission form yet.

## 1.13.1

### Patch Changes

- c14e583: Reject Auto job submissions whose PAE matrix size doesn't match the structure's residue count, with a message giving both numbers. Previously these jobs were queued and failed on the worker in the `pae` step. Residues are counted the same way `pae2const.py` counts them (#1232).

  `parseCifAtomSite` now reads `_atom_site` values the way mmCIF readers do: records may wrap across lines or share a line, quoted values are unquoted, and `;` text fields and comments are handled.

## 1.13.0

### Minor Changes

- 57d5366: Add `flush()` to the job event notifier, which publishes events still held back by the throttle. `run-job` now publishes job events (as the worker does) and flushes them before it exits, and SIGTERM stops its MongoDB connection retries, so a job cancelled before it starts exits as cancelled. Job emails are now awaited, so a failed send is caught and recorded on the email step instead of becoming an unhandled rejection, and `run-job` can't exit in the middle of one.

## 1.12.0

### Minor Changes

- fa30a7b: Harden the admin users API. `GET /users` and `GET /users/:id` now return an explicit allowlist of fields instead of the raw user document, so refresh tokens, API token hashes, OTP and confirmation codes, and OAuth ids never leave the server. The response also gains the read-only fields the admin UI needs: `status`, `lastAccess`, `jobCount`, `oauthProviders`, and `emailNotifications`. `PATCH /users` refuses to let an Admin or Manager deactivate their own account or drop their own admin role, and `last_access` is now recorded on login and token refresh.

## 1.11.0

### Minor Changes

- 4b10be0: Validate and normalize experimental SAXS data the same way in the UI and the backend, so interactive and API-submitted jobs are treated equally. A single shared analyzer (`analyzeSaxsData`) now:

  - Detects data in nm⁻¹ (from the file header, the q range and the Guinier Rg) and converts q to Å⁻¹; files whose units cannot be determined are rejected with a request to state them.
  - Trims points below q = 0.005 Å⁻¹ and above q = 0.45 Å⁻¹ with a warning.
  - Warns, but no longer rejects, when fewer than 100 points remain.

  Job forms gain a "q units" selector (auto / Å⁻¹ / nm⁻¹) and show what will change in the file before submission. The API accepts the same `q_units` field and returns `saxs_warnings` with the job. Converted or trimmed files are rewritten in the job directory with the original kept as `<name>.orig`. SANS jobs are unchanged.

## 1.10.0

### Minor Changes

- 5831537: Show each chain's molecule type (PRO, DNA, RNA or CARB) in the MD Constraints display. New jobs record the types alongside their constraints; older jobs show no type chip. The public results page now receives the MD constraints too, so it shows the same display.

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
