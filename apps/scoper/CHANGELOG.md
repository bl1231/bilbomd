# @bilbomd/scoper

## 1.8.1

### Patch Changes

- 98f6cef: Update bullmq to v6 and ioredis to v6.

  Both are major bumps. Almost no source changes were required — the APIs removed
  in bullmq v6 (legacy repeatable jobs, `Queue#client`/`Worker#blockingClient`,
  `Job#discard()`, the `debounce` option) are not used here, and the calls that
  did change semantics were already compatible: `Worker#resume()` is now async
  and was already awaited in `worker.ts` and `workerControl.ts`.

  The one user-visible change: bullmq v6 removes the `paused` job state, so
  `Queue#getJobCounts()` no longer returns a `paused` count. The admin Queue
  Overview grid had a "Paused" column bound to it, which would have rendered
  blank, so the column and its now-dead type field are removed. Queue-level pause
  state is unaffected — it still comes from `isPaused` and its toggle control.

  ioredis v6 negotiates RESP3 by default but keeps `replyMapping: "legacy"`, so
  reply shapes remain v5-compatible; the existing `RedisOptions` need no
  `protocol: 2` override. `@bull-board` 8.6.1 already declares
  `bullmq: "^5.79.2 || ^6.0.0"`.

## 1.8.0

### Minor Changes

- 9ae70fe: Job-complete emails now link directly to a results page that works without logging in (#978). Every new job gets an unguessable `results_token`, the unauthenticated `/results/:publicId` endpoints accept it alongside anonymous `public_id`s, and the worker/scoper emails link to `/results/<token>` (falling back to the dashboard link for jobs created before the token existed).

### Patch Changes

- Updated dependencies [9ae70fe]
  - @bilbomd/mongodb-schema@2.8.0

## 1.7.21

### Patch Changes

- ceda104: Update all non-major pnpm dependencies. Notable runtime bumps: mongoose 9.8.1 → 9.9.2, nodemailer 9.0.3 → 9.0.5, redis 6.1.0 → 6.2.1, express-rate-limit 8.6.1 → 8.6.2, openid-client 6.8.4 → 6.8.5, @bull-board 8.4.0 → 8.6.1, and MUI 9.2.0 → 9.3.1. Tooling bumps include vite 8.1.5 → 8.2.1, turbo 2.10.7 → 2.10.10 and typescript-eslint 8.65.0 → 8.67.0. No source changes were required.
- Updated dependencies [ceda104]
  - @bilbomd/mongodb-schema@2.7.6

## 1.7.20

### Patch Changes

- 27739a6: Update dependencies to their latest compatible versions (bullmq 5.81.3, ioredis 5.11.1, mongoose 9.8.1, axios 1.19.0, @bull-board 8.4.0, @mui/x-data-grid 9.10.1, molstar 5.11.0, react 19.2.8, react-router 8.3.0, recharts 3.10.1, vite 8.1.5, eslint 10.8.0, typescript-eslint 8.65.0, prettier 3.9.6, turbo 2.10.7, and others).

  Major upgrades: connect-redis 10 (only breaking change is dropping Node 18/20 support; the store API is unchanged), jsdom 30 and @testing-library/jest-dom 7 (both test-only).

  ioredis is pinned to exact 5.11.1 to match the exact version required by bullmq 5.81.3. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).

  Removed react-dropzone from @bilbomd/ui — it was declared but never imported anywhere in the source or the built bundle.

  Fixed the HeaderBox style assertion: jsdom 30 resolves `rem` to absolute px in `getComputedStyle` (jsdom 29 did not), so the expected padding is now `16px 8px` rather than `16px 0.5rem`.

- Updated dependencies [27739a6]
  - @bilbomd/mongodb-schema@2.7.5

## 1.7.19

### Patch Changes

- e04ad77: Update dependencies to their latest compatible versions (bullmq 5.79.3, mongoose 9.7.4, nodemailer 9.0.3, @bull-board 8.1.2, redis 6.1.0, MUI 9.2.0, @mui/x-data-grid 9.8.0, react-router 8.2.0, recharts 3.9.2, vite 8.1.4, vitest 4.1.10, eslint 10.6.0, typescript-eslint 8.63.0, prettier 3.9.5, turbo 2.10.4, and others).

  ioredis is pinned to 5.10.1 to match the exact version required by bullmq. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).

- Updated dependencies [e04ad77]
  - @bilbomd/mongodb-schema@2.7.4

## 1.7.18

### Patch Changes

- cd7b271: Update Node.js to 26.4.0 and bump dependencies to latest (axios, mongoose, @mui/material, @mui/system, recharts, vite, @vitejs/plugin-react, globals, typescript-eslint). ioredis remains pinned to 5.10.1 to match bullmq's exact requirement.
- Updated dependencies [cd7b271]
  - @bilbomd/mongodb-schema@2.7.3

## 1.7.17

### Patch Changes

- 6284830: Update dependencies to latest: bullmq, mongoose, nodemailer, uuid, @bull-board/\*, @mui/x-data-grid, react-router 8, and root tooling (@types/node 26, lint-staged). Pin ioredis to 5.10.1 to match the version bundled with bullmq and avoid duplicate-package type conflicts.
- Updated dependencies [6284830]
  - @bilbomd/mongodb-schema@2.7.2

## 1.7.16

### Patch Changes

- 7daa4c7: Update dependencies: form-data 4.0.6 (CVE fix), nodemailer 9.0.1, bullmq 5.78.1, axios 1.18.0, MUI 9.1.1/x-data-grid 9.5.0, react-router 7.18.0, molstar 5.10.1, multer 2.2.0. ioredis remains pinned at 5.10.1 per bullmq requirement.

## 1.7.15

### Patch Changes

- c2ba6c5: Update npm dependencies to latest versions (axios, bullmq, morgan, concurrently, @mui/x-data-grid, react, react-dom, react-router, vite, vitest, typescript-eslint, and related). ioredis intentionally held at 5.10.1 for BullMQ compatibility.

## 1.7.14

### Patch Changes

- 005482b: Update dependencies to latest within range: bullmq, mongoose, nodemailer, date-fns, react-router, type-fest, eslint, lint-staged, and turbo. ioredis intentionally kept pinned at 5.10.1 to match BullMQ's exact ioredis dependency.
- Updated dependencies [005482b]
  - @bilbomd/mongodb-schema@2.7.1

## 1.7.13

### Patch Changes

- 55fb36b: Fix OS command injection vulnerability in scoper worker and add filename validation.

  The scoper's `runFoXS` function used `exec()` with a shell-interpolated template literal to copy files, allowing shell metacharacters in user-supplied filenames to execute arbitrary commands. Replaced with `fs.copyFile()` which never invokes a shell.

  Added `noShellMetacharsTest` filename validator to the backend validation helpers and a new `scoperJobSchema` that applies it to PDB and DAT file uploads, rejecting filenames containing `;`, `&`, `|`, backticks, `$`, `<`, `>`, `(`, `)`, `{`, `}`, or `!` before the job is queued.

## 1.7.12

### Patch Changes

- 5c15d8a: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
- Updated dependencies [e2d4125]
  - @bilbomd/mongodb-schema@2.7.0

## 1.7.11

### Patch Changes

- 29200d1: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).

## 1.7.10

### Patch Changes

- Updated dependencies [d82f306]
  - @bilbomd/mongodb-schema@2.6.1

## 1.7.9

### Patch Changes

- b9c8a64: Update all npm/pnpm dependencies to latest versions within semver ranges.

  Notable updates: mongoose 9.4→9.6, molstar 5.8→5.9, react-router 7.14→7.15, vite 8.0.7→8.0.11, bullmq 5.73→5.76, msw 2.13→2.14, MUI 9.0.0→9.0.1, react/react-dom 19.2.5→19.2.6.

- Updated dependencies [c2137eb]
  - @bilbomd/mongodb-schema@2.6.0

## 1.7.8

### Patch Changes

- 6ca5249: Harden Docker Compose deployments: remove Docker socket mount from worker, add no-new-privileges to all services, set read_only root filesystem on worker containers with /tmp tmpfs, and drop all Linux capabilities from worker. Addresses F-7 pen test finding (Docker socket privilege escalation).
- b41b107: Add custom seccomp profile blocking AF_ALG sockets (CVE-2026-31431) and other dangerous syscalls not needed by BilboMD containers. Profile applied to all services in all Docker Compose environments. Addresses F-6 pen test finding.
- be7f034: Strip all SUID/SGID bits from container filesystems before dropping to non-root user. Added to backend, ui, worker-base, worker, scoper-base, and scoper Dockerfiles. Addresses F-6 pen test finding (SUID binary privilege escalation).
- Updated dependencies [24b6dc2]
  - @bilbomd/mongodb-schema@2.5.5

## 1.7.7

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).
- Updated dependencies [57f8495]
  - @bilbomd/mongodb-schema@2.5.4

## 1.7.6

### Patch Changes

- Updated dependencies [e24f1c6]
  - @bilbomd/mongodb-schema@2.5.3

## 1.7.5

### Patch Changes

- bf1837b: Replace npm-run-all with pnpm && chaining in all build scripts. Removes an unnecessary dependency that called npm run internally rather than pnpm run.

## 1.7.4

### Patch Changes

- 9c95606: Fix KGS progress polling: suppress noisy ENOENT error on first poll before output directory exists, and stop polling once all conformers are generated.

## 1.7.3

### Patch Changes

- 4923ccb: Add structured logging with JSON file output and request context propagation.

  File transports now emit JSON for machine-parseable log ingestion (Loki, Elasticsearch, etc.). Console output remains colorized human-readable text.

  Backend gains `AsyncLocalStorage`-based request context: every log line within an HTTP request automatically includes `requestId` without threading `req` through callers. Key controller call sites migrated from string interpolation to structured object fields.

- 7d8ebdc: Update all npm dependencies to latest minor/patch versions. Includes axios 1.15, bullmq 5.73.1, @bull-board 6.21, nodemailer 8.0.5, react 19.2.5, vite 8.0.7, vitest 4.1.3, turbo 2.9.5, and MUI 7.3.10.
- Updated dependencies [82d0bf4]
  - @bilbomd/mongodb-schema@2.5.2

## 1.7.2

### Patch Changes

- d9a702d: Update all dependencies. Patch/minor bumps across the board: bullmq, dotenv, mongoose, eslint, molstar, react-router, msw, vite, sass-embedded, @types/node, turbo. Bump @types/nodemailer from ^7 to ^8 to match the already-upgraded nodemailer v8 runtime.
- Updated dependencies [d9a702d]
  - @bilbomd/mongodb-schema@2.5.1

## 1.7.1

### Patch Changes

- eeb1eed: Fix Dependabot PRs failing CI due to pnpm frozen lockfile mismatch. CI now skips --frozen-lockfile when the PR author is dependabot[bot].

## 1.7.0

### Minor Changes

- 474cef7: Add results_ready flag to track results packaging outcome independently of job status.

  Jobs that complete all MD science steps but fail during final tar.gz creation now remain
  Completed rather than Failed. A new results_ready boolean field (false by default) is set
  to true only after a successful archive is created, making the packaging outcome observable.

  The UI disables the Download Results button and shows a warning when results_ready is false,
  and surfaces download errors to the user via an Alert instead of silently logging to console.

### Patch Changes

- Updated dependencies [474cef7]
  - @bilbomd/mongodb-schema@2.5.0

## 1.6.2

### Patch Changes

- be1e0a5: Make SMTP mail settings fully configurable via environment variables. Adds support for `BILBOMD_MAILER_SECURE` (TLS toggle) and optional `BILBOMD_MAILER_USER`/`BILBOMD_MAILER_PASS` (SMTP auth) in all three apps. Worker and Scoper now respect `BILBOMD_MAILER_HOST` and `BILBOMD_MAILER_PORT` from env instead of hard-coded values. Existing deployments are unaffected — all new vars default to current behavior.

## 1.6.1

### Patch Changes

- cebfddb: bump nodejs to v24.13.1
- Updated dependencies [cebfddb]
- Updated dependencies [624082c]
  - @bilbomd/mongodb-schema@2.4.1

## 1.6.0

### Minor Changes

- 673e173: Bump Node.js from v22 to v24

### Patch Changes

- 72f4ea4: Update dependencies.
  Improve pipeline instructions.
  Update instructions to reference OpenMM in addition to CHARMM.
- Updated dependencies [72f4ea4]
- Updated dependencies [673e173]
  - @bilbomd/mongodb-schema@2.4.0

## 1.5.21

### Patch Changes

- 1d0c4f5: Update nodejs
  Update pnpm
  Update all deps
  Fix some typescript errors that surfaced.
- Updated dependencies [1d0c4f5]
  - @bilbomd/mongodb-schema@2.3.5

## 1.5.20

### Patch Changes

- 1853a50: Split docker build into 2: base imafge and main image.
  This should speed up subsequent GitHub Actions workflows that are building the main scoper image

## 1.5.19

### Patch Changes

- 0daf2a4: improved cicd pipeline
- Updated dependencies [0daf2a4]
  - @bilbomd/mongodb-schema@2.3.4

## 1.5.18

### Patch Changes

- 34ef235: Update all dependencies with minor or patch level bumps
- 690bed9: Update mongoose from v8 to v9.
  Split `backend` tests into unit and integration
- Updated dependencies [690bed9]
  - @bilbomd/mongodb-schema@2.3.3

## 1.5.17

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

## 1.5.16

### Patch Changes

- da97649: Refresh dependencies across the workspace to pick up recent bug fixes and minor improvements. No schema/API changes and no expected breaking changes.
  - Backend/Worker/Scoper: `bullmq@5.66`, `mongoose@8.20.3`, `winston@3.19`, `cron@4.4`
  - UI: `react@19.2.3`, `react-dom@19.2.3`, `@mui/x-data-grid@8.22`, `recharts@3.6`, `molstar@5.4.2`
  - Tooling: `vite@7.3`, `@vitejs/plugin-react@5.1.2`, `vite-tsconfig-paths@6.0.1`, `jsdom@27.3`, `sass-embedded@1.96`, `eslint@9.39.2`, `@typescript-eslint@8.50`, `@types/node@25`
  - Lint/tests: small cleanups to silence unused vars/imports in a few UI tests; no behavioral changes.

- Updated dependencies [da97649]
  - @bilbomd/mongodb-schema@2.3.1

## 1.5.15

### Patch Changes

- Updated dependencies [5145c75]
  - @bilbomd/mongodb-schema@2.3.0

## 1.5.14

### Patch Changes

- Updated dependencies [53937de]
  - @bilbomd/mongodb-schema@2.2.0

## 1.5.13

### Patch Changes

- 1c71d30: Update npm dependencies
- Updated dependencies [1c71d30]
  - @bilbomd/mongodb-schema@2.1.2

## 1.5.12

### Patch Changes

- b107fdb: Manually trigger patch to all packages
- Updated dependencies [b107fdb]
  - @bilbomd/mongodb-schema@2.1.1

## 1.5.11

### Patch Changes

- 3b0da23: Add Example Data option for Alphafold jobs
  Adjust all `config.ts` to support boolean toggles for pipeline availability

## 1.5.10

### Patch Changes

- 2ff4c96: Refactor `Scoper` results and steps to align with new DTO mindset
- Updated dependencies [bdc6d1d]
- Updated dependencies [2ff4c96]
  - @bilbomd/mongodb-schema@2.1.0

## 1.5.9

### Patch Changes

- a4082e0: update for CVE-2025-64756
- Updated dependencies [a4082e0]
  - @bilbomd/mongodb-schema@2.0.2

## 1.5.8

### Patch Changes

- 6846821: Remove some deprecated Typescript config settings in prep for Typescript 6.x
  This required a bit of fiddling with `bilbomd-ui` types and interfaces

## 1.5.7

### Patch Changes

- c417040: Update all pnpm dependencies
- Updated dependencies [c417040]
  - @bilbomd/mongodb-schema@2.0.1

## 1.5.6

### Patch Changes

- f514114: Allow public unauthenticated BilboMD job submission
  Add new public endpoints to `bilbomd-backend`
  Add Help component
  Add Cookie consent
  Add PublicJobPage to display job results for unauthenticated users
  Add Privacy Policy Component
  Add new shared `bilbomd-types` package for Typescript types/interfaces
- Updated dependencies [f514114]
  - @bilbomd/mongodb-schema@2.0.0

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
