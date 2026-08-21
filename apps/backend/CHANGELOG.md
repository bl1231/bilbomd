# @bilbomd/backend

## 2.11.2

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

## 2.11.1

### Patch Changes

- 1a6ae2c: Security: enforce job ownership on all `/jobs/:id*` routes and `/external/jobs/:id/results`. A new `verifyJobOwnership` middleware returns 404 unless the requester owns the job or holds the Admin/Manager role, closing an IDOR where any authenticated user could read, download, or delete any job by id. Also sanitizes the PDB filename in `downloadPDB`. Fixes #981.

## 2.11.0

### Minor Changes

- 9ae70fe: Job-complete emails now link directly to a results page that works without logging in (#978). Every new job gets an unguessable `results_token`, the unauthenticated `/results/:publicId` endpoints accept it alongside anonymous `public_id`s, and the worker/scoper emails link to `/results/<token>` (falling back to the dashboard link for jobs created before the token existed).

### Patch Changes

- Updated dependencies [9ae70fe]
  - @bilbomd/mongodb-schema@2.8.0
  - @bilbomd/md-utils@1.1.24

## 2.10.3

### Patch Changes

- ceda104: Update all non-major pnpm dependencies. Notable runtime bumps: mongoose 9.8.1 → 9.9.2, nodemailer 9.0.3 → 9.0.5, redis 6.1.0 → 6.2.1, express-rate-limit 8.6.1 → 8.6.2, openid-client 6.8.4 → 6.8.5, @bull-board 8.4.0 → 8.6.1, and MUI 9.2.0 → 9.3.1. Tooling bumps include vite 8.1.5 → 8.2.1, turbo 2.10.7 → 2.10.10 and typescript-eslint 8.65.0 → 8.67.0. No source changes were required.
- Updated dependencies [ceda104]
  - @bilbomd/mongodb-schema@2.7.6
  - @bilbomd/md-utils@1.1.23

## 2.10.2

### Patch Changes

- 27739a6: Update dependencies to their latest compatible versions (bullmq 5.81.3, ioredis 5.11.1, mongoose 9.8.1, axios 1.19.0, @bull-board 8.4.0, @mui/x-data-grid 9.10.1, molstar 5.11.0, react 19.2.8, react-router 8.3.0, recharts 3.10.1, vite 8.1.5, eslint 10.8.0, typescript-eslint 8.65.0, prettier 3.9.6, turbo 2.10.7, and others).

  Major upgrades: connect-redis 10 (only breaking change is dropping Node 18/20 support; the store API is unchanged), jsdom 30 and @testing-library/jest-dom 7 (both test-only).

  ioredis is pinned to exact 5.11.1 to match the exact version required by bullmq 5.81.3. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).

  Removed react-dropzone from @bilbomd/ui — it was declared but never imported anywhere in the source or the built bundle.

  Fixed the HeaderBox style assertion: jsdom 30 resolves `rem` to absolute px in `getComputedStyle` (jsdom 29 did not), so the expected padding is now `16px 8px` rather than `16px 0.5rem`.

- Updated dependencies [27739a6]
  - @bilbomd/md-utils@1.1.22
  - @bilbomd/mongodb-schema@2.7.5

## 2.10.1

### Patch Changes

- e04ad77: Update dependencies to their latest compatible versions (bullmq 5.79.3, mongoose 9.7.4, nodemailer 9.0.3, @bull-board 8.1.2, redis 6.1.0, MUI 9.2.0, @mui/x-data-grid 9.8.0, react-router 8.2.0, recharts 3.9.2, vite 8.1.4, vitest 4.1.10, eslint 10.6.0, typescript-eslint 8.63.0, prettier 3.9.5, turbo 2.10.4, and others).

  ioredis is pinned to 5.10.1 to match the exact version required by bullmq. TypeScript is intentionally held at v6 because typescript-eslint does not yet support TypeScript 7 (peer range `<6.1.0`).

- Updated dependencies [e04ad77]
  - @bilbomd/md-utils@1.1.21
  - @bilbomd/mongodb-schema@2.7.4

## 2.10.0

### Minor Changes

- 6f514cb: Show the Superfacility API token expiration live instead of from a hand-maintained value. The backend adds an authenticated `/sfapi/account/clients` endpoint that reads the configured client's `expiresAt` directly from NERSC, and the UI TokenExpirationChip now sources its date from that endpoint. The static `SFAPI_TOKEN_EXPIRES` config value (and the `sfapi.token_expires` Helm value / configmap entry) is removed, so the expiration display can no longer drift out of date.

## 2.9.14

### Patch Changes

- cd7b271: Update Node.js to 26.4.0 and bump dependencies to latest (axios, mongoose, @mui/material, @mui/system, recharts, vite, @vitejs/plugin-react, globals, typescript-eslint). ioredis remains pinned to 5.10.1 to match bullmq's exact requirement.
- Updated dependencies [cd7b271]
  - @bilbomd/mongodb-schema@2.7.3
  - @bilbomd/md-utils@1.1.20

## 2.9.13

### Patch Changes

- 538d4f7: Fix Admin "Edit User" failing with "Invalid username format" when changing a user's roles. The backend no longer requires (or changes) the username on update — admins edit roles, active status, and email only. The username is now shown read-only in the form. Added real client-side validation (valid email, at least one role) and a friendly duplicate-email check on the backend.

## 2.9.12

### Patch Changes

- e81b638: Fix the `Prefetch` component so it dispatches into the real app store via `useAppDispatch` instead of creating a throw-away store with `setupStore()`. Previously every prefetch request went out without an Authorization header (the throw-away store had no auth state) and silently 401'd, so the component did no useful caching. Also skip prefetching the user list for non-Manager/Admin users since they can't view it.

  Close backend authorization gaps on the `/users` routes. Administrative endpoints (`GET /users`, `PATCH /users`, `GET /users/:id`, `DELETE /users/:id`) now require the Manager/Admin role via `verifyRoles` — previously any authenticated user could list all users, edit arbitrary users (including escalating their own roles to Admin), or delete users. Self-service endpoints (`DELETE /users/delete-user-by-username/:username`, `POST /users/change-email`, `/verify-otp`, `/resend-otp`) now enforce account ownership via a new `verifyAccountOwnership` middleware, so callers can only act on their own account.

## 2.9.11

### Patch Changes

- 6284830: Update dependencies to latest: bullmq, mongoose, nodemailer, uuid, @bull-board/\*, @mui/x-data-grid, react-router 8, and root tooling (@types/node 26, lint-staged). Pin ioredis to 5.10.1 to match the version bundled with bullmq and avoid duplicate-package type conflicts.
- Updated dependencies [6284830]
  - @bilbomd/md-utils@1.1.19
  - @bilbomd/mongodb-schema@2.7.2

## 2.9.10

### Patch Changes

- 6819d5e: Fix MD movie playback failing with "Video access attempt without valid session". Native `<video>` requests authenticate via the `bilbomd-session` cookie (they can't carry the JWT), but the cookie expired 15 minutes after creation while the 7-day refresh token kept the app working — so movies 401'd after a short idle. The session is now `rolling` (expiry slides forward on each request) with a `maxAge` matching the 7-day refresh-token lifetime. See issue #911.

## 2.9.9

### Patch Changes

- f8ad484: Admin dashboard cleanup: remove the deprecated "BilboMD Job Statistics" panel and the legacy `/stats` endpoint (which relied on inaccurate denormalized user counters). Recreate the jobs-by-type pie chart in the Analytics section backed by accurate aggregation of the jobs collection, and add an all-time "Total Submitted" KPI sourced from the usage-event log.
- 7daa4c7: Update dependencies: form-data 4.0.6 (CVE fix), nodemailer 9.0.1, bullmq 5.78.1, axios 1.18.0, MUI 9.1.1/x-data-grid 9.5.0, react-router 7.18.0, molstar 5.10.1, multer 2.2.0. ioredis remains pinned at 5.10.1 per bullmq requirement.

## 2.9.8

### Patch Changes

- cc9498f: Avoid deriving an invalid CORS origin when `BILBOMD_URL` already includes an explicit port. Previously the allowed-origins list always appended `:BILBOMD_UI_PORT`, producing junk entries like `http://localhost:3001:3001` for no-proxy installs that set `BILBOMD_URL=http://localhost:3001`. The port is now only appended when `BILBOMD_URL` has no port of its own.
- cc9498f: Add a `COOKIE_SECURE` environment variable to control the `Secure` attribute on auth and session cookies. Browsers silently drop `Secure` cookies over plain HTTP, which broke login, token refresh, and ORCID for installs accessed via `http://` (e.g. `http://localhost:3001` with no TLS-terminating proxy). The flag defaults to the previous behavior (`Secure` when `BILBOMD_ENV=production`); set `COOKIE_SECURE=false` to allow cookies over HTTP. This also unifies the secure-cookie logic across the refresh-token, session, and ORCID cookies, which previously read inconsistent env vars (`BILBOMD_ENV` vs `NODE_ENV`).

## 2.9.7

### Patch Changes

- 03df572: reduce logging levels for teh getJobs controller

## 2.9.6

### Patch Changes

- a4900d0: Skip the non-fatal Swagger JSON archival write in production. The hardened container runs with a read-only root filesystem, so the write always failed with EACCES and logged a warning on every startup. The in-memory OpenAPI spec served at runtime is unaffected; the snapshot is now only written outside production.

## 2.9.5

### Patch Changes

- c2ba6c5: Update npm dependencies to latest versions (axios, bullmq, morgan, concurrently, @mui/x-data-grid, react, react-dom, react-router, vite, vitest, typescript-eslint, and related). ioredis intentionally held at 5.10.1 for BullMQ compatibility.
- Updated dependencies [c2ba6c5]
  - @bilbomd/md-utils@1.1.18

## 2.9.4

### Patch Changes

- eae412e: Fix HTTP 500 on user registration (and other broken queries) caused by mongoose `sanitizeFilter`. With `sanitizeFilter` enabled globally, any `{ $op: ... }` filter value is wrapped in `$eq` to block operator injection, which then fails to cast against the field's type. This broke the registration previous-email lookup (`$in`), the `deleteOldJobs` cron (`$lt`), and the anonymous job-quota checks (`$in`). Developer-built operator filters are now either rewritten to scalar matches or wrapped in `mongoose.trusted()`. Added regression tests that exercise real mongoose casting under `sanitizeFilter`.

## 2.9.3

### Patch Changes

- 005482b: Update dependencies to latest within range: bullmq, mongoose, nodemailer, date-fns, react-router, type-fest, eslint, lint-staged, and turbo. ioredis intentionally kept pinned at 5.10.1 to match BullMQ's exact ioredis dependency.
- Updated dependencies [005482b]
  - @bilbomd/mongodb-schema@2.7.1
  - @bilbomd/md-utils@1.1.17

## 2.9.2

### Patch Changes

- 55fb36b: Fix OS command injection vulnerability in scoper worker and add filename validation.

  The scoper's `runFoXS` function used `exec()` with a shell-interpolated template literal to copy files, allowing shell metacharacters in user-supplied filenames to execute arbitrary commands. Replaced with `fs.copyFile()` which never invokes a shell.

  Added `noShellMetacharsTest` filename validator to the backend validation helpers and a new `scoperJobSchema` that applies it to PDB and DAT file uploads, rejecting filenames containing `;`, `&`, `|`, backticks, `$`, `<`, `>`, `(`, `)`, `{`, `}`, or `!` before the job is queued.

## 2.9.1

### Patch Changes

- 844e9f9: Fix Redis syntax error in session store by using the official redis@5 client for connect-redis.

  connect-redis@9 expects the redis@5 client API (set with options object), but an ioredis client was being passed, causing ERR syntax error on every session write.

## 2.9.0

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

- 937f5a9: Production-readiness hardening for the ORCID OAuth login flow (PR 1 of issue #817).
  - **Require ORCID env vars (no silent sandbox fallbacks).** `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_REDIRECT_URI`, `ORCID_ISSUER`, `ORCID_BASE_URL`, and `ORCID_PUBLIC_API_URL` are now read with `getEnvVar()` and validated at the top of `initOrcidClient()`. Startup fails fast if any is missing when `ORCID_AUTH_ENABLED=true`. The previous defaults that fell back to `https://sandbox.orcid.org` while `ORCID_ISSUER` defaulted to `https://orcid.org` could silently split a deployment across sandbox and production endpoints. The `.env.example` now lists a PRODUCTION block as the default and a commented SANDBOX block for dev/staging.
  - **Redis-backed express-session store.** Sessions now persist in Redis via `connect-redis` (reusing the existing BullMQ `ioredis` connection) instead of the default in-memory store, so the `req.session.orcidProfile` bridge between `/orcid/callback` and `/orcid/finalize` survives backend restarts and works across replicas.
  - **Redact tokens in logs.** Added a `redactTokens()` helper used by the ORCID callback and confirmation handlers so OAuth `access_token` / `refresh_token` / `id_token` values are no longer written to logs.

- b94577a: Security hardening for the ORCID OAuth login flow (PR 2 of issue #817).
  - **Account-takeover guard.** The callback and the finalize endpoints now both refuse to issue JWTs when the verified ORCID email matches an existing BilboMD account that is not already linked to this ORCID iD. Users are redirected to `/auth/orcid-error?reason=email_already_registered` and pointed at a BilboMD administrator to link their account. Previously the flow would silently sign the user in as the pre-existing (e.g., legacy magic-link) account.
  - **Require a primary, verified ORCID email.** The email-selection fallback that accepted any verified email — and then any email at all — has been removed. If an ORCID profile has no `primary && verified` email, the user is redirected to `/auth/orcid-error?reason=no_primary_verified` with instructions to update their ORCID profile. Closes the related "Pending status" dead code in the finalize handler.
  - **Verify the ID token and check the nonce.** The hand-rolled axios `POST /oauth/token` is replaced with `openid-client.authorizationCodeGrant`, which validates the ID-token signature against the discovered JWKS, the `iss`/`aud` claims, the `nonce` (matched to the cookie set in `handleOrcidLogin`), and the `state`. Identity claims (`sub`, `given_name`, `family_name`, `name`) now come from the verified ID token rather than from a separate unauthenticated API call. The Public-API call is kept only for the email (not returned by the `openid` scope).
  - **Tighten state/nonce cookies.** `handleOrcidLogin` cookies switched from `SameSite=None` to `SameSite=Lax` (ORCID redirects back to the same origin) and gained a 5-minute `maxAge` so abandoned sign-in flows cannot leave state behind.
  - **Friendlier error page.** `OrcidError.tsx` now renders human-readable explanations for `no_primary_verified`, `email_already_registered`, `token_exchange`, `missing_id_token`, `userinfo_fetch`, `finalize`, and `session` reasons.

### Patch Changes

- 5c15d8a: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
- Updated dependencies [5c15d8a]
- Updated dependencies [e2d4125]
  - @bilbomd/md-utils@1.1.16
  - @bilbomd/mongodb-schema@2.7.0

## 2.8.6

### Patch Changes

- 29200d1: Upgrade Node.js runtime from v24 to v26. Updated all package engines fields and dependency versions accordingly. Fixed UI test setup to provide an explicit in-memory Web Storage mock, working around Node.js v26's experimental localStorage global (which returns undefined without --localstorage-file).
- Updated dependencies [29200d1]
  - @bilbomd/md-utils@1.1.15

## 2.8.5

### Patch Changes

- 73c535c: Fix OF3 pipeline issues and add Jobs runtime column.
  - Correct the OpenFold3 GitHub link in the OF3 job form instructions to point to the right repository (aqlaboratory/openfold-3)
  - Add "Experimental - Please report problems to Scott" label to the OF3 job form header
  - Fix 404 error on the OF3 "Download Example Data" button by wiring up the missing backend route and handler
  - Add a Runtime column to the Jobs table showing wall-clock duration from submission to completion for all job types (live for running jobs)

## 2.8.4

### Patch Changes

- 6502a18: Fix OF3 and AlphaFold job submission failure caused by entity validation schema incorrectly requiring an `id` field. The `id` field is UI-only and not part of `IOpenFoldEntity` or `IAlphaFoldEntity`, so it was never present in the parsed form data, causing all submissions to fail backend validation with a 400 error.

## 2.8.3

### Patch Changes

- 3ae2172: Fix Color by Domain preset in Molstar viewer for Classic CRD jobs.

  Two-phase component creation prevents "Could not find node" errors when coloring ensemble structures. Also stores `md_constraints` in MongoDB for Classic CRD jobs so the domain-coloring preset has the constraint data it needs.

## 2.8.2

### Patch Changes

- Updated dependencies [6a693d2]
  - @bilbomd/bilbomd-types@1.6.1
  - @bilbomd/md-utils@1.1.14

## 2.8.1

### Patch Changes

- Updated dependencies [d82f306]
  - @bilbomd/mongodb-schema@2.6.1
  - @bilbomd/md-utils@1.1.13

## 2.8.0

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
  - @bilbomd/md-utils@1.1.12

## 2.7.8

### Patch Changes

- 6ca5249: Harden Docker Compose deployments: remove Docker socket mount from worker, add no-new-privileges to all services, set read_only root filesystem on worker containers with /tmp tmpfs, and drop all Linux capabilities from worker. Addresses F-7 pen test finding (Docker socket privilege escalation).
- 24b6dc2: Add per-account OTP attempt counter to prevent brute-force of magic link tokens. After 5 failed attempts (expired OTP submissions), the OTP is nulled and the user must request a new magic link. Addresses F-1 pen test finding (per-account rate limiting).
- b41b107: Add custom seccomp profile blocking AF_ALG sockets (CVE-2026-31431) and other dangerous syscalls not needed by BilboMD containers. Profile applied to all services in all Docker Compose environments. Addresses F-6 pen test finding.
- be7f034: Strip all SUID/SGID bits from container filesystems before dropping to non-root user. Added to backend, ui, worker-base, worker, scoper-base, and scoper Dockerfiles. Addresses F-6 pen test finding (SUID binary privilege escalation).
- Updated dependencies [e4aa0b3]
- Updated dependencies [24b6dc2]
  - @bilbomd/md-utils@1.1.11
  - @bilbomd/mongodb-schema@2.5.5

## 2.7.7

### Patch Changes

- 0b03fac: Fix critical security vulnerabilities: NoSQL injection in OTP auth flow and CHARMM system directive RCE.

  Cast `email` and `otp` inputs to string before Mongoose queries to prevent MongoDB operator injection. Enable `mongoose.set('sanitizeFilter', true)` globally as defence-in-depth. Add keyword allowlist to `isValidConstInpFile` to reject CHARMM directives (`system`, `open`, etc.) that could execute arbitrary OS commands when the constraint file is STREAMed by the worker.

## 2.7.6

### Patch Changes

- 964095e: Surface step progress messages on the public job page. The FoXS step now writes periodic progress text (e.g. "FoXS: 1800/3600 (50%)") to the MongoDB step message alongside the BullMQ update. The public job API now includes steps data, and the public job progress box displays the latest step message below the progress bar.
- Updated dependencies [964095e]
  - @bilbomd/bilbomd-types@1.5.4
  - @bilbomd/md-utils@1.1.10

## 2.7.5

### Patch Changes

- 8dac70d: Fix admin/manager access to MD Movies from other users' jobs. Admins and Managers can now stream movie files and fetch movie metadata for any job, consistent with their ability to view all jobs. Regular users are still restricted to their own jobs.

## 2.7.4

### Patch Changes

- ccdad28: Enable BilboMD AlphaFold pipeline on local GPU hosts (initial target: epyc, 2× NVIDIA A100) and implement the OpenMM engine path for the SANS pipeline.

  ### AlphaFold pipeline (local GPU)

  Adds `processBilboMDAlphaFoldJob` — a new worker pipeline that runs ColabFold in a
  sibling Docker container via the host Docker socket, then continues through the existing
  OpenMM minimize / heat / md / FoXS / MultiFoXS path. `bilboMdHandler` now routes
  `alphafold` jobs to this local pipeline when `USE_NERSC=false`; CHARMM AlphaFold
  remains NERSC-only.

  New env vars (see `infra/.env.example`):
  - `HOST_UPLOAD_DIR` — host-side path that backs DATA_VOL inside the worker
  - `HOST_COLABFOLD_CACHE` — host-side path for the ~50GB ColabFold weights cache
  - `COLABFOLD_IMAGE` — overridable image tag (default `bl1231/bilbomd-colabfold:latest`)
  - `COLABFOLD_TIMEOUT_MS` — per-AF-run timeout in ms (default 1h)
  - `DOCKER_GID` — host docker group GID; added to the worker container via `group_add`
    so the non-root `bilbo` user can access `/var/run/docker.sock`

  ### Bug fixes
  - **Docker socket permissions**: worker's non-root user (`bilbo`) now gets the host
    docker group added via `group_add` in both epyc Compose files, fixing
    "permission denied on /var/run/docker.sock" when spawning sibling containers.
  - **ColabFold working directory**: added `--workdir /bilbomd/work` to the `docker run`
    args so `colabfold_batch` resolves the relative `af-entities.fasta` path correctly
    against the mounted volume.
  - **AutoRg step display**: AlphaFold jobs now initialize the `autorg` step as `Success`
    (with computed Rg values) at submission time rather than `Waiting`, since AutoRg runs
    as a submission precondition and is never re-run by the worker pipeline.

  ### OpenMM SANS pipeline

  Previously all OpenMM function calls in `bilbomd-sans.ts` were commented out, causing
  OpenMM SANS jobs to skip MD entirely and fail at Pepsi-SANS with no PDB files. Now wires
  up `prepareOpenMMConfig`, `runOmmMinimize`, `runOmmHeat`, `runOmmMD`, and a new
  `mirrorOmmMdToPepsiSANS` step that symlinks PDB frames from `openmm/md/rg_{N}/` into
  `pepsisans/rg{N}/` for Pepsi-SANS to consume. `remediatePDBFiles` is correctly skipped
  for OpenMM since its PDBs already use standard chain IDs.

  ### Operator setup on epyc
  1. Find the host docker GID: `getent group docker | cut -d: -f3`
  2. Add `DOCKER_GID=<value>` to `.env.prod`.
  3. Pre-create `/bilbomd/colabfold-cache` on the host.
  4. Pull and prime the ColabFold weights:
     ```
     docker pull $COLABFOLD_IMAGE
     docker run --rm -v /bilbomd/colabfold-cache:/cache $COLABFOLD_IMAGE \
       colabfold_batch --download-only
     ```
  5. Set `ENABLE_BILBOMD_ALPHAFOLD=true` and `USE_NERSC=false` in `.env.prod`.

## 2.7.3

### Patch Changes

- Updated dependencies [d0504b0]
  - @bilbomd/bilbomd-types@1.5.3
  - @bilbomd/md-utils@1.1.9

## 2.7.2

### Patch Changes

- 682fd84: Fix DNA/RNA residue handling in both CHARMM and OpenMM pipelines.

  OpenMM: `minimize.py` now calls `Modeller.addHydrogens(forcefield)` after PDBFixer so that DNA/RNA residues get all required hydrogen atoms (PDBFixer alone misses some, causing a "No template found" crash at system creation).

  CHARMM: `constraintUtils.ts` segment-ID mapping now correctly handles DNA/RNA chains. `parseInpConstraints` strips the mol-type prefix (PRO/DNA/RNA/CAR/CAL) to extract the real chain ID from pdb2crd segids (e.g. `DNAD` → `D`). `generateInpFromConstraints`/`convertYamlToInp` accept an optional `chainSegidMap` built by the new `buildChainSegidMap` utility, so YAML→INP conversion emits the correct segid for each chain instead of always defaulting to `PRO{chain}`.

- Updated dependencies [682fd84]
  - @bilbomd/md-utils@1.1.8

## 2.7.1

### Patch Changes

- 0fda064: CORS allowed origins are now derived at runtime from `BILBOMD_URL` and `BILBOMD_UI_PORT`, fixing CORS errors for external users installing BilboMD on their own hardware. An optional `CORS_ALLOWED_ORIGINS` env var (comma-separated) is also supported for additional origins.

## 2.7.0

### Minor Changes

- e99111b: Add admin-only BullMQ dashboard access. Admins can now open the bull-board queue dashboard via a new sidebar link. Protected by nginx auth_request using the session cookie, so no unauthenticated access is possible.

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

- ba1931f: Add SAXS curve preview with Guinier region highlight to the Classic job submission form.

## 2.6.1

### Patch Changes

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

## 2.5.13

### Patch Changes

- d9a702d: Update all dependencies. Patch/minor bumps across the board: bullmq, dotenv, mongoose, eslint, molstar, react-router, msw, vite, sass-embedded, @types/node, turbo. Bump @types/nodemailer from ^7 to ^8 to match the already-upgraded nodemailer v8 runtime.
- Updated dependencies [d9a702d]
  - @bilbomd/md-utils@1.1.4
  - @bilbomd/mongodb-schema@2.5.1

## 2.5.12

### Patch Changes

- eeb1eed: Fix Dependabot PRs failing CI due to pnpm frozen lockfile mismatch. CI now skips --frozen-lockfile when the PR author is dependabot[bot].
- fc1be50: Add PDB residue validation to reject unsupported residues at job submission time. PDB files containing residue names not handled by pdb2crd.py now return a clear error message listing the offending residues, rather than silently failing during job processing.
- fc1be50: Move the supported PDB residue list to a single constant (`SUPPORTED_PDB_RESIDUES`) in `@bilbomd/bilbomd-types`, shared by both the backend validator and the frontend `hasAllowedResiduesOnly` check. Eliminates the risk of the two lists diverging silently. Also adds common ions (MG, CA, ZN, etc.) and HSD to the allowed set, and adds the missing `pdbCheck()` to the Auto job form schema.
- Updated dependencies [fc1be50]
  - @bilbomd/bilbomd-types@1.4.1

## 2.5.11

### Patch Changes

- 474cef7: Add results_ready flag to track results packaging outcome independently of job status.

  Jobs that complete all MD science steps but fail during final tar.gz creation now remain
  Completed rather than Failed. A new results_ready boolean field (false by default) is set
  to true only after a successful archive is created, making the packaging outcome observable.

  The UI disables the Download Results button and shows a warning when results_ready is false,
  and surfaces download errors to the user via an Alert instead of silently logging to console.

- Updated dependencies [474cef7]
  - @bilbomd/mongodb-schema@2.5.0
  - @bilbomd/bilbomd-types@1.4.0
  - @bilbomd/md-utils@1.1.3

## 2.5.10

### Patch Changes

- 0537640: Upgrade major npm dependencies: TypeScript 6.0, Vite 8, @vitejs/plugin-react 6, jsdom 29, @types/supertest 7.
  - Update `vite.config.ts` to use `rolldownOptions` (renamed from `rollupOptions` in Vite 8)
  - Fix `vi.mock` factory JSX hoisting incompatibility introduced by @vitejs/plugin-react 6
  - Update eslint-config peer dependency to accept TypeScript 5 or 6

- Updated dependencies [0537640]
  - @bilbomd/md-utils@1.1.2

## 2.5.9

### Patch Changes

- be1e0a5: Make SMTP mail settings fully configurable via environment variables. Adds support for `BILBOMD_MAILER_SECURE` (TLS toggle) and optional `BILBOMD_MAILER_USER`/`BILBOMD_MAILER_PASS` (SMTP auth) in all three apps. Worker and Scoper now respect `BILBOMD_MAILER_HOST` and `BILBOMD_MAILER_PORT` from env instead of hard-coded values. Existing deployments are unaffected — all new vars default to current behavior.
- 8a65390: Add `ENABLE_CHARMM_ENGINE` env var to allow deployments to disable the CHARMM md_engine option in all job forms. When set to `false`, the CHARMM radio button is disabled and forms default to OpenMM.

## 2.5.8

### Patch Changes

- 2cb627a: Fix two startup crashes: use `ipKeyGenerator` helper in `publicJobLimiter` to satisfy express-rate-limit v8 IPv6 validation, and demote swagger JSON write failure from fatal (`process.exit`) to a non-fatal warning (the file is not used at runtime).

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
