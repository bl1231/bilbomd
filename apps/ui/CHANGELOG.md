# @bilbomd/ui

## 2.20.4

### Patch Changes

- c2ba6c5: Update npm dependencies to latest versions (axios, bullmq, morgan, concurrently, @mui/x-data-grid, react, react-dom, react-router, vite, vitest, typescript-eslint, and related). ioredis intentionally held at 5.10.1 for BullMQ compatibility.
- 6e4baf7: Auto job forms: warn when an uploaded PDB/CIF structure has an all-zero B-factor (pLDDT) column. The non-blocking warning explains that AlphaFold3-style PAE JSON will let BilboMD recover pLDDT automatically, and otherwise no rigid bodies will be defined. Applies to both the new and resubmit auto-job forms.

## 2.20.3

### Patch Changes

- 005482b: Update dependencies to latest within range: bullmq, mongoose, nodemailer, date-fns, react-router, type-fest, eslint, lint-staged, and turbo. ioredis intentionally kept pinned at 5.10.1 to match BullMQ's exact ioredis dependency.
- Updated dependencies [005482b]
  - @bilbomd/mongodb-schema@2.7.1

## 2.20.2

### Patch Changes

- 8d28405: Clean up unguarded `console.*` calls in the UI (#851). Removed stray debugging
  `console.log` statements and dead commented-out console lines, and routed genuine
  diagnostics through a new `utils/logger` abstraction whose `log`/`debug`/`info`
  are no-ops in production builds while `warn`/`error` still surface. Added a
  `no-console` ESLint rule (with a test-file exception) to prevent regressions.
- f3cfd32: Fix usePersist hook crashing on corrupted localStorage data. The hook now safely falls back to `false` when the stored `persist` value is not valid JSON, instead of throwing a SyntaxError during render.

## 2.20.1

### Patch Changes

- 93f907f: Warn users on the Classic job form when the chosen Rg Max is more than 2× the measured Rg. Targets far above the measured Rg can cause numerical instability that crashes the MD simulation. The non-blocking warning shows the ratio, the AutoRg-suggested value, and a recommended Rg Max.

## 2.20.0

### Minor Changes

- 97529b6: Add `ORCID_AUTH_ENABLED` feature flag (default `false`) that gates the ORCID OAuth login flow. When disabled, the backend does not register the `/api/v1/auth/orcid/*` routes and skips OIDC discovery on startup, and the UI `/login` page redirects to `/magicklink`. ORCID will stay disabled in production until the hardening work tracked in issue #817 is complete.
- e2d4125: ORCID data hygiene & UX (PR 3 of issue #817). Separates the internal `username` (an opaque, URL-safe identifier) from the human-readable `displayName`, removes dead OAuth-token storage, and aligns the sign-in UI with ORCID's official branding guidelines.

  **Option A: separate internal ID from display label**
  - ORCID accounts now get an opaque `username = orcid-${orcidId}` (e.g., `orcid-0000-0002-1234-5678`). Deterministic, unique by construction, URL-safe, and decoupled from any human name.
  - New backend helper `userDisplayName()` derives a display label from `firstName + lastName`, falling back to `username` for legacy users with no name fields populated.
  - Access-token JWT payload now includes a `displayName` claim, computed at sign time. The UI `useAuth` hook exposes it; legacy tokens without the claim fall back to `username`.
  - UI display sites (`Breadcrumbs`, `Settings` → `UserAvatar`) now show `displayName` instead of `username`. URL routes, job-ownership filters, and admin-edit forms still use `username`.
  - Admin-edit username regex relaxed from `[a-zA-Z0-9_]+` to `[a-zA-Z0-9_-]+` so ORCID-derived usernames pass validation.

  **H3: stop persisting ORCID access/refresh tokens**
  - Dropped `accessToken`, `refreshToken`, `tokenType`, `scope`, and `expiresIn` from the User schema `oauth[]` subdocument and from the OAuth session profile. We never call ORCID APIs on the user's behalf after sign-in, so persisting the bearer token only enlarged the blast radius if the database were leaked. Existing data on old user docs is harmless and will fall off on next login.

  **H4: confirmation page becomes read-only**
  - `OrcidConfirmation` is no longer a misleading editable form — Formik + Yup + `TextField` are gone. Replaced with read-only display rows that surface First Name, Last Name, Email, ORCID iD, the derived BilboMD display name, and the opaque BilboMD account ID. Clicking "Confirm and Continue" calls finalize with an empty body (the backend has always trusted the session profile, not the request body).

  **L4: branding text**
  - `Login.tsx` heading and button updated from "Sign in with ORCID" to "Sign in with ORCID iD" per ORCID's official sign-in guidelines.

  **L5: ORCID brand asset**
  - The existing `apps/ui/src/assets/orcid.png` is the ORCID wordmark. ORCID's sign-in guidelines call for the circular green iD icon on sign-in buttons; the wordmark is for "about" contexts. Flagged for replacement before the production-credential review demo.

### Patch Changes

- 5c15d8a: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
- 5c15d8a: Enable `noUncheckedIndexedAccess` TypeScript compiler option in apps/ui.

  Array and object index access now returns `T | undefined` instead of `T`, catching potential out-of-bounds access at compile time. Fixed 175 type errors across 35 files by adding non-null assertions on bounds-checked loops, typed constant tuples, and explicit `??` fallbacks where undefined is a real possibility.

- b94577a: Security hardening for the ORCID OAuth login flow (PR 2 of issue #817).
  - **Account-takeover guard.** The callback and the finalize endpoints now both refuse to issue JWTs when the verified ORCID email matches an existing BilboMD account that is not already linked to this ORCID iD. Users are redirected to `/auth/orcid-error?reason=email_already_registered` and pointed at a BilboMD administrator to link their account. Previously the flow would silently sign the user in as the pre-existing (e.g., legacy magic-link) account.
  - **Require a primary, verified ORCID email.** The email-selection fallback that accepted any verified email — and then any email at all — has been removed. If an ORCID profile has no `primary && verified` email, the user is redirected to `/auth/orcid-error?reason=no_primary_verified` with instructions to update their ORCID profile. Closes the related "Pending status" dead code in the finalize handler.
  - **Verify the ID token and check the nonce.** The hand-rolled axios `POST /oauth/token` is replaced with `openid-client.authorizationCodeGrant`, which validates the ID-token signature against the discovered JWKS, the `iss`/`aud` claims, the `nonce` (matched to the cookie set in `handleOrcidLogin`), and the `state`. Identity claims (`sub`, `given_name`, `family_name`, `name`) now come from the verified ID token rather than from a separate unauthenticated API call. The Public-API call is kept only for the email (not returned by the `openid` scope).
  - **Tighten state/nonce cookies.** `handleOrcidLogin` cookies switched from `SameSite=None` to `SameSite=Lax` (ORCID redirects back to the same origin) and gained a 5-minute `maxAge` so abandoned sign-in flows cannot leave state behind.
  - **Friendlier error page.** `OrcidError.tsx` now renders human-readable explanations for `no_primary_verified`, `email_already_registered`, `token_exchange`, `missing_id_token`, `userinfo_fetch`, `finalize`, and `session` reasons.

- 6f17ac5: Display a warning alert on the single job page and public job page when MD ran on CPU due to CUDA being unavailable.
- Updated dependencies [e2d4125]
  - @bilbomd/mongodb-schema@2.7.0

## 2.19.2

### Patch Changes

- 29200d1: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).

## 2.19.1

### Patch Changes

- a5da1c8: Hide BilboMD OF3 nav item and Queued column when deployed to NERSC. Queue Time is shown instead of Queued on NERSC.

## 2.19.0

### Minor Changes

- c1e6adb: Split job timing into separate Queued and Runtime columns. Runtime now shows time from when processing started (time_started) to completion, excluding queue wait. The new Queued column shows time from submission until processing began (or until now for pending/submitted jobs).

### Patch Changes

- 844bd2d: Replace print() with Python logging in all OpenMM scripts, add a post-minimization energy gate, and surface OpenMM stderr errors to the UI job status pages.

  All OpenMM Python scripts (minimize.py, heat.py, md.py, plot_rgyrs.py and all utils) now use a shared `utils/logger.py` logger. INFO-level output goes to stdout (visible as `[step][stdout]` in worker logs); WARNING and ERROR go to stderr (`[step][stderr]`), matching the log levels already applied by the Node.js worker.

  A post-minimization energy gate in minimize.py checks potential energy after `minimizeEnergy()` completes and exits with code 1 if the value is NaN/Inf or exceeds 1,000,000 kJ/mol — catching severe atom-clash failures at the correct step rather than as an opaque NaN crash during heating.

  The heating loop in heat.py now reports potential energy alongside temperature at each 1000-step checkpoint and includes NaN position detection with an early abort.

  A pre-minimization clash detection step (clash_check.py) was added to identify severe atom overlaps before minimization begins.

  The UI (SingleJobPage and PublicJobPage) now displays the stderr error message from the failed step in the job failure alert, giving users actionable feedback instead of a generic error message.

## 2.18.0

### Minor Changes

- c302402: Add CIF file support to the BilboMD SANS job form. Users can now upload _.cif (mmCIF) structure files in addition to _.pdb files, matching the capability of other BilboMD pipeline forms.

### Patch Changes

- 73c535c: Fix OF3 pipeline issues and add Jobs runtime column.
  - Correct the OpenFold3 GitHub link in the OF3 job form instructions to point to the right repository (aqlaboratory/openfold-3)
  - Add "Experimental - Please report problems to Scott" label to the OF3 job form header
  - Fix 404 error on the OF3 "Download Example Data" button by wiring up the missing backend route and handler
  - Add a Runtime column to the Jobs table showing wall-clock duration from submission to completion for all job types (live for running jobs)

## 2.17.0

### Minor Changes

- d48216a: Replace all static PNG pipeline schematics with inline SVG React components. The SVGs scale cleanly at any resolution, respond to MUI dark/light theme automatically, and eliminate the need for separate dark-mode PNG files. Pipelines covered: AF + OpenMM, AF + CHARMM, Classic PDB + OpenMM, Classic PDB + CHARMM, Classic CRD/PSF, Auto + OpenMM, Auto + CHARMM, OpenFold3, and SANS.

## 2.16.2

### Patch Changes

- 6502a18: Fix OF3 "Load Example Data" to populate the correct protein-DNA complex example: a 203-aa protein plus two 24-nt DNA strands, matching the actual files in `example-data/of3/`. Previously a different, unrelated 823-aa single-protein sequence was hard-coded.

## 2.16.1

### Patch Changes

- 3ae2172: Fix Color by Domain preset in Molstar viewer for Classic CRD jobs.

  Two-phase component creation prevents "Could not find node" errors when coloring ensemble structures. Also stores `md_constraints` in MongoDB for Classic CRD jobs so the domain-coloring preset has the constraint data it needs.

## 2.16.0

### Minor Changes

- 6a693d2: Fix DNA representation consistency in Molstar viewer and add domain-based coloring.
  - #768: DNA now renders consistently as cartoon (tube/slab) for both CHARMM and OpenMM pipelines. The fix uses a residue-name-based selection that recognises standard PDB names (DA, DT, DG, DC) and CHARMM names (ADE, GUA, CYT, THY) explicitly.
  - #769: Add "Color by Domain" toggle button above the Molstar viewport. When active, fixed-body regions are colored blue and rigid-body regions orange, matching the PyMol movie scheme; flexible linkers retain the default chain coloring. The button appears whenever MD constraint data is available, independent of ensemble count.

### Patch Changes

- ab9a1dd: Update BilboMD citation to the published NAR 2026 paper. Worker README files now include the new citation and a BibTeX entry. UI pages (Home, About, Help, Acknowledgments) now show a copyable BibTeX block alongside the citation.
- Updated dependencies [6a693d2]
  - @bilbomd/bilbomd-types@1.6.1

## 2.15.2

### Patch Changes

- 9c48e1a: Fix NaN SVG errors in scoper job FoXS chart. Guard against NaN/Infinity error values in residuals calculation and handle fewer than 2 FoXS entries gracefully.

## 2.15.1

### Patch Changes

- 5922e9d: Allow admins to delete jobs stuck in Running or Submitted state. A warning is shown in the confirmation dialog explaining that the underlying simulation process may continue running.
- 655c59b: Fix OF3 job type display and add Rg/conformations to all MD pipelines. Corrects "Unknown Job Type" for OF3 jobs, fixes a runtime error when rendering OF3 job details, and makes the sans, alphafold, and of3 handlers consistent with pdb/crd/auto by showing Number of MD Runs, Rg values, and Number of conformations.
- Updated dependencies [d82f306]
  - @bilbomd/mongodb-schema@2.6.1

## 2.15.0

### Minor Changes

- c2137eb: Add BilboMD OF3 pipeline using OpenFold3 for structure prediction.

  OpenFold3 replaces ColabFold as the structure predictor and supports Protein,
  DNA, and RNA chains simultaneously. The downstream OpenMM MD + FoXS + MultiFoXS
  pipeline is identical to BilboMD AF. Input is a JSON query file; the best sample
  is selected by `sample_ranking_score` from OpenFold3 confidence outputs.

### Patch Changes

- b9c8a64: Update all npm/pnpm dependencies to latest versions within semver ranges.

  Notable updates: mongoose 9.4→9.6, molstar 5.8→5.9, react-router 7.14→7.15, vite 8.0.7→8.0.11, bullmq 5.73→5.76, msw 2.13→2.14, MUI 9.0.0→9.0.1, react/react-dom 19.2.5→19.2.6.

- Updated dependencies [c2137eb]
  - @bilbomd/bilbomd-types@1.6.0
  - @bilbomd/mongodb-schema@2.6.0

## 2.14.6

### Patch Changes

- 6ca5249: Harden Docker Compose deployments: remove Docker socket mount from worker, add no-new-privileges to all services, set read_only root filesystem on worker containers with /tmp tmpfs, and drop all Linux capabilities from worker. Addresses F-7 pen test finding (Docker socket privilege escalation).
- b41b107: Add custom seccomp profile blocking AF_ALG sockets (CVE-2026-31431) and other dangerous syscalls not needed by BilboMD containers. Profile applied to all services in all Docker Compose environments. Addresses F-6 pen test finding.
- be7f034: Strip all SUID/SGID bits from container filesystems before dropping to non-root user. Added to backend, ui, worker-base, worker, scoper-base, and scoper Dockerfiles. Addresses F-6 pen test finding (SUID binary privilege escalation).
- e1cead2: Add CHARMM keyword allowlist to frontend const.inp validation. Dangerous directives like `system`, `open`, and `read` are now rejected client-side before upload, giving immediate feedback and layering the defence already present on the backend.
- Updated dependencies [24b6dc2]
  - @bilbomd/mongodb-schema@2.5.5

## 2.14.5

### Patch Changes

- a5fd493: Add PDB preparation step (strip waters and ions) to SANS OpenMM pipeline. Rename strip_ions.py → prep_pdb.py and runStripIons → runPrepPdb for accuracy — the script has always removed both HOH waters and metal/polyatomic ions.

  Add GAFF2/metal cofactor alerts to the SANS new job form, matching the behaviour already present on the Classic PDB and Auto forms.

## 2.14.4

### Patch Changes

- f2032ce: Fix stuck step message on job pages and add adaptive polling. Step messages now reflect the currently Running step instead of relying on iteration order, which caused stale messages from earlier completed steps to persist. SingleJobPage now polls at 10s while a job is Running, stops polling on terminal states, and falls back to 30s for other states.

## 2.14.3

### Patch Changes

- 964095e: Surface step progress messages on the public job page. The FoXS step now writes periodic progress text (e.g. "FoXS: 1800/3600 (50%)") to the MongoDB step message alongside the BullMQ update. The public job API now includes steps data, and the public job progress box displays the latest step message below the progress bar.
- Updated dependencies [964095e]
  - @bilbomd/bilbomd-types@1.5.4

## 2.14.2

### Patch Changes

- b5d24dd: Improve error message on failed job page: logged-in users see their job UUID for support reference; anonymous users see a prompt to create an account for personalized support.
- 04bd25d: Add Molstar viewer support for SANS jobs.

  Worker: fix SANS ensemble PDB files to use proper MODEL N / ENDMDL formatting so Molstar can load each conformation as a separate assembly. Populate results.sans.ensembles in MongoDB after each SANS job completes.

  UI: enable the Molstar viewer for completed SANS jobs in SingleJobPage. Viewer.tsx now routes SANS jobs through the same ensemble loading path as classic/auto/alphafold jobs.

## 2.14.1

### Patch Changes

- ff2b1f4: Fix MD movies not appearing without manual page refresh for SANS and OpenMM jobs by using RTK Query's built-in pollingInterval instead of a broken manual setInterval.

## 2.14.0

### Minor Changes

- c764232: Enforce engine-driven input mode across all job forms. Classic form: MD engine selection now drives input format (CHARMM requires CRD/PSF from CHARMM-GUI, OpenMM accepts PDB/CIF). Auto, AlphaFold, and SANS forms: CHARMM engine option hidden, defaulting to OpenMM. Prevents PDB-to-CRD/PSF conversion failures with non-standard residues. Metal cofactor warning now suggests CHARMM-GUI with inline link button. Fix Classic form regressions: Conformations per Rg defaults to 600 for OpenMM, auto-Rg validation no longer requires manual field interaction. Fix Help page pipeline schematic images for dark mode support.

### Patch Changes

- 26b85b8: Update BilboMD citation to the published NAR 2026 paper. Replaces the Pelikan et al. 2009 Gen Physiol Biophys reference with Classen et al. 2026 Nucleic Acids Research (doi: 10.1093/nar/gkag377) across the Home, About, Help, and Acknowledgments pages.

## 2.13.1

### Patch Changes

- d0504b0: Fix UI cofactor alerts to reflect GAFF2 support for organic small molecules. Split STRIPPABLE_COFACTORS into GAFF_COFACTORS (organic, now parameterized via GAFF2) and METAL_COFACTORS (heme/porphyrins, still removed). FAD and similar molecules now show a blue info alert instead of a yellow warning.
- cde25c7: Fix Molstar viewer not showing glycans, cofactors, and ions on initial load. Apply StructurePreset to all ensemble structures and add branched entity support to display presets.
- Updated dependencies [d0504b0]
  - @bilbomd/bilbomd-types@1.5.3

## 2.13.0

### Minor Changes

- d2e967c: Upgrade MUI core packages to v9 and MUI X Data Grid to v9. Migrate system props (`alignItems`, `justifyContent`, `direction`, `display`, `mt`, `mb`, `mx`, `fontWeight`, `textAlign`, etc.) to `sx` prop across 41 components. Update deprecated icon imports (`Outline` → `Outlined`). Migrate `MenuProps.PaperProps` to `slotProps.paper`. Remove legacy `@emotion/core` dependency.

## 2.12.0

### Minor Changes

- e99111b: Add admin-only BullMQ dashboard access. Admins can now open the bull-board queue dashboard via a new sidebar link. Protected by nginx auth_request using the session cookie, so no unauthenticated access is possible.

### Patch Changes

- 57f8495: Bump non-major npm dependencies (bullmq, vite, vitest, react-router, openid-client, prettier, typescript, and others).
- Updated dependencies [57f8495]
  - @bilbomd/bilbomd-types@1.5.2
  - @bilbomd/mongodb-schema@2.5.4

## 2.11.3

### Patch Changes

- Updated dependencies [e24f1c6]
  - @bilbomd/mongodb-schema@2.5.3

## 2.11.2

### Patch Changes

- 54ad7a0: Fix NaN crash in Scoper FoXS plots by guarding against zero error values in residual calculation and empty/non-finite domain values in Y-axis — mirrors the same fix applied to FoXSAnalysis in #573.

## 2.11.1

### Patch Changes

- bf1837b: Replace npm-run-all with pnpm && chaining in all build scripts. Removes an unnecessary dependency that called npm run internally rather than pnpm run.

## 2.11.0

### Minor Changes

- afa3f90: Enhance SAXS Data Preview plot with green Guinier region and low-SNR warning bands. The Guinier fit region is now highlighted in green, and any q-ranges where σ(q) > I(q) (SNR < 1) are highlighted in red so users can see at a glance which portions of their experimental data may be unreliable.

## 2.10.1

### Patch Changes

- f01ad72: Fix FoXS plot visual break caused by low-SNR data points (#572).
  - Filter data points where error ≥ intensity (SNR < 1) before plotting; these
    points produce negative lower error-bar bounds that break log-scale rendering
  - Display a count of hidden low-SNR points as a caption below the chart title
  - Add Recharts ErrorBar to the experimental-intensity line so data uncertainty
    is visible for the remaining points
  - Replace `domain={['auto','auto']}` on log-scale Y-axes with an explicit
    floor-of-log10 domain function to prevent Recharts auto-domain artifacts
  - Add `hasSaxsQualityIssues()` to ValidationFunctions for future per-form
    data-quality warnings (infrastructure only; per-form integration is a
    follow-up task)

## 2.10.0

### Minor Changes

- ba1931f: Add SAXS curve preview with Guinier region highlight to the Classic job submission form.

### Patch Changes

- 3a11ee6: Show KGSRNA in the Engine column for Scoper jobs in the Jobs table.

## 2.9.1

### Patch Changes

- a392327: Fix Molstar viewer not displaying Mg2+ ions for Scoper job results. Apply StructurePreset for Scoper structures so the polymer (cartoon) and ions (spacefill) are both rendered correctly.
- e182790: Show KGSRNA instead of CHARMM as the MD Engine for Scoper jobs in the job details panel.
- 7d8ebdc: Update all npm dependencies to latest minor/patch versions. Includes axios 1.15, bullmq 5.73.1, @bull-board 6.21, nodemailer 8.0.5, react 19.2.5, vite 8.0.7, vitest 4.1.3, turbo 2.9.5, and MUI 7.3.10.
- Updated dependencies [82d0bf4]
  - @bilbomd/mongodb-schema@2.5.2
  - @bilbomd/bilbomd-types@1.5.1

## 2.9.0

### Minor Changes

- f3ca090: Add support for mmCIF (.cif) file uploads in Classic/pdb and Auto job types.

  Users can now upload AlphaFold 3 (or any standard mmCIF) files directly into BilboMD without manual conversion. The frontend and backend validate chain IDs and residue names from the `_atom_site` loop block using the same `SUPPORTED_PDB_RESIDUES` allowlist used for PDB validation. The worker converts CIF to PDB at pipeline start using biopython before CHARMM or OpenMM processing.

### Patch Changes

- d936a9e: Reject PDB files containing multiple MODEL/ENDMDL records on form submission. Affects Classic, Auto, and SANS job forms.
- Updated dependencies [f3ca090]
  - @bilbomd/bilbomd-types@1.5.0

## 2.8.2

### Patch Changes

- d9a702d: Update all dependencies. Patch/minor bumps across the board: bullmq, dotenv, mongoose, eslint, molstar, react-router, msw, vite, sass-embedded, @types/node, turbo. Bump @types/nodemailer from ^7 to ^8 to match the already-upgraded nodemailer v8 runtime.
- Updated dependencies [d9a702d]
  - @bilbomd/mongodb-schema@2.5.1

## 2.8.1

### Patch Changes

- eeb1eed: Fix Dependabot PRs failing CI due to pnpm frozen lockfile mismatch. CI now skips --frozen-lockfile when the PR author is dependabot[bot].
- fc1be50: Move the supported PDB residue list to a single constant (`SUPPORTED_PDB_RESIDUES`) in `@bilbomd/bilbomd-types`, shared by both the backend validator and the frontend `hasAllowedResiduesOnly` check. Eliminates the risk of the two lists diverging silently. Also adds common ions (MG, CA, ZN, etc.) and HSD to the allowed set, and adds the missing `pdbCheck()` to the Auto job form schema.
- Updated dependencies [fc1be50]
  - @bilbomd/bilbomd-types@1.4.1

## 2.8.0

### Minor Changes

- 408a810: Add toggle buttons to show/hide ensemble structures in the Molstar viewer. A dedicated panel above the 3D canvas renders one button per ensemble size (e.g. "Size 1", "Size 2", "Size 3"), allowing users to independently show or hide each ensemble. Closes #251.
- 474cef7: Add results_ready flag to track results packaging outcome independently of job status.

  Jobs that complete all MD science steps but fail during final tar.gz creation now remain
  Completed rather than Failed. A new results_ready boolean field (false by default) is set
  to true only after a successful archive is created, making the packaging outcome observable.

  The UI disables the Download Results button and shows a warning when results_ready is false,
  and surfaces download errors to the user via an Alert instead of silently logging to console.

### Patch Changes

- ada4522: Remove eslint-plugin-react dependency. With the automatic JSX transform (`react-jsx`) and TypeScript, the plugin's rules are unnecessary — the two rules it provided (`react/react-in-jsx-scope`, `react/prop-types`) were already disabled. Hook linting is retained via eslint-plugin-react-hooks.
- Updated dependencies [474cef7]
  - @bilbomd/mongodb-schema@2.5.0
  - @bilbomd/bilbomd-types@1.4.0

## 2.7.1

### Patch Changes

- f7f8268: Fix React error #130 caused by Vite 8/Rolldown auto-splitting vendor deps into 130+ micro-chunks, producing broken cross-chunk default export resolution. Restored a correct pnpm-aware `manualChunks` implementation that consolidates all vendor deps into a stable `vendor` chunk and isolates the 3 MB Molstar library into its own `vendor-molstar` chunk. MolstarViewer is lazily imported in SingleJobPage and PublicJobPage to ensure it loads on demand.
- cd8cdb8: Fix two Vite build warnings: replace vite-tsconfig-paths plugin with Vite's native resolve.tsconfigPaths option, and convert About component to lazy import in AnonRoutes to resolve ineffective dynamic import warning.
- 6e67e04: Resolve react-refresh lint warning in FoXSEnsembleCharts component.
- 1e4e745: Remove broken manualChunks configuration and let Vite 8 handle automatic code splitting. The previous manualChunks function collapsed all pnpm dependencies into a single 4.7MB chunk; automatic splitting now correctly defers the large Molstar library to a lazy chunk loaded only when viewing job results.

## 2.7.0

### Minor Changes

- 0537640: Upgrade major npm dependencies: TypeScript 6.0, Vite 8, @vitejs/plugin-react 6, jsdom 29, @types/supertest 7.
  - Update `vite.config.ts` to use `rolldownOptions` (renamed from `rollupOptions` in Vite 8)
  - Fix `vi.mock` factory JSX hoisting incompatibility introduced by @vitejs/plugin-react 6
  - Update eslint-config peer dependency to accept TypeScript 5 or 6

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
