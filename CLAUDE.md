# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is BilboMD?

BilboMD is a SAXS (Small Angle X-ray Scattering) modeling platform that uses molecular dynamics (CHARMM/OpenMM) to generate molecular models, calculates theoretical SAXS curves via FoXS, and finds best-fit ensembles via MultiFoXS. It supports 7 job types: `pdb`, `crd`, `auto`, `alphafold`, `sans`, `scoper`, `multi`.

## Monorepo Structure

Turborepo + pnpm workspaces. Non-obvious bits the code won't tell you:

- `@bilbomd/mongodb-schema` has dual exports: `@bilbomd/mongodb-schema` (full, for backend/worker) and `@bilbomd/mongodb-schema/frontend` (frontend-safe subset) — importing the wrong one leaks server-only code into the SPA.
- `apps/worker` has two execution paths: local (Hyperion) and NERSC/Perlmutter (Slurm).

### Docker (local dev)

```bash
cd infra
./build.sh local                 # Build local Docker images
./deploy-to-beamline.sh local    # Start all services via docker-compose.local.yml
./deploy-to-beamline.sh --help   # All commands: up/down/restart/pull/ps/logs/config
```

Environment: copy `infra/.env.example` to `infra/.env.local`.

## Testing

- Place test files in `__tests__` directories within each module, not at project root.
  - Example: `src/controllers/jobs/__tests__/getAllJobs.test.ts`
- Do not use `--reporter=verbose` flag.
- Use `vi` from vitest for mocking (not jest globals).

## Code Style

- Prefer **arrow functions**: `const myFunc = () => {}`
- Avoid `any` — use proper types or generics
- Prefer functional patterns over classes
- All modules use ESM (`"type": "module"`)

## Development Workflow

**IMPORTANT**: When working on code changes, always follow this workflow:

### 1. Create a New Git Branch

Before starting any code changes, create a new branch using the appropriate naming convention:

```bash
git checkout -b <prefix>/<descriptive-name>
# Examples:
git checkout -b feature/add-user-roles
git checkout -b fix/job-timeout
git checkout -b refactor/add-rtk-query-types
```

See [Git Branch Naming Convention](#git-branch-naming-convention) for prefix guidelines.

### 2. Verify All Checks Pass Before Completion

**Before considering work complete**, `pnpm lint`, `pnpm build`, and `pnpm test` must all pass without errors. For package-specific work, run them filtered to that package (`pnpm -F @bilbomd/<pkg> lint`, etc.).

### 3. Fix Any Issues

If any of the checks fail:
- **Linting errors**: Fix ESLint warnings and errors before committing
- **Build errors**: Resolve TypeScript errors and build issues
- **Test failures**: Fix failing tests or update tests if behavior changed intentionally

**Do not commit or push code that fails any of these checks.**

### 4. Commit and Push

Once all checks pass:

```bash
git add -A
git commit -m "descriptive commit message"
git push origin <branch-name>
```

## Versioning

Uses **Changesets** for per-package versioning. After code changes:

```bash
pnpm changeset        # Select packages, choose semver bump, write summary
```

Changesets are applied on merge to `main`, producing git tags and Docker image semver tags. `updateInternalDependencies: "patch"` is enabled — bumping an internal package auto-bumps dependents.

**IMPORTANT**: `pnpm changeset` is interactive and won't work in non-TTY environments (like Claude Code CLI). Write the changeset file by hand instead — see the `changeset` skill (`.claude/skills/changeset/SKILL.md`) for the format and examples.

## Git Branch Naming Convention

Use standardized branch prefixes to indicate the type of work. Branch names should use kebab-case (lowercase with hyphens).

### Core Prefixes

- `feature/` — New features and enhancements
  - Examples: `feature/user-auth`, `feature/saxs-export`, `feature/backend/new-api`
- `fix/` — Bug fixes
  - Examples: `fix/login-redirect`, `fix/job-timeout`, `fix/ui/chart-rendering`
- `refactor/` — Code refactoring without functional changes
  - Examples: `refactor/clean-old-code`, `refactor/backend/simplify-middleware`
- `docs/` — Documentation-only changes
  - Examples: `docs/update-readme`, `docs/api-guide`, `docs/add-deployment-notes`

### Additional Prefixes

- `test/` — Adding or updating tests
  - Examples: `test/add-middleware-tests`, `test/ui/job-form-validation`
- `chore/` — Maintenance tasks, dependency updates, build changes
  - Examples: `chore/update-deps`, `chore/configure-prettier`
- `perf/` — Performance improvements
  - Examples: `perf/optimize-query`, `perf/worker/reduce-memory-usage`
- `ci/` — CI/CD pipeline changes
  - Examples: `ci/add-coverage-report`, `ci/fix-build-cache`

### Naming Guidelines

1. **Format**: Use kebab-case for the descriptive part (lowercase with hyphens)
   - ✅ Good: `feature/add-user-roles`
   - ❌ Bad: `feature/Add_User_Roles`, `feature/addUserRoles`

2. **Scope (optional)**: Include package scope when it adds clarity in the monorepo
   - With scope: `feature/backend/job-queue-retry`
   - Without scope: `feature/job-queue-retry`
   - Common scopes: `backend`, `ui`, `worker`, `scoper`

3. **Description**: Keep it concise but descriptive
   - ✅ Good: `fix/job-status-update`
   - ❌ Too vague: `fix/bug`
   - ❌ Too verbose: `fix/issue-with-job-status-not-updating-correctly-in-database`

4. **Issue tracking (optional)**: Include issue numbers when applicable
   - Example: `fix/job-timeout-issue-123` or `feature/add-export-399`

## Architecture Details

### Job Processing Flow

1. Frontend submits job via RTK Query to backend `/jobs` endpoint
2. Backend stores job in MongoDB, enqueues to Redis (BullMQ)
3. Worker picks up job from queue, runs MD pipeline (CHARMM or OpenMM)
4. Worker updates job status/progress in MongoDB during execution
5. Results prepared and made available for download

### NERSC/Perlmutter Integration

The worker has a separate NERSC code path (`bilbomd-nersc.ts`, `bilboMdNerscJobMonitor.ts`) that submits Slurm jobs to Perlmutter for GPU-accelerated simulations. NERSC API token management is in `nersc-api-token-functions.ts`.

### MongoDB Data Model

- Jobs stored with **embedded user objects** — filter with `{'user._id': user._id}`, not `{user: user._id}`
- Collections: `users` (with roles Admin/Manager/User), `jobs`, `multijobs`
- `buildBilboMDJobDTO()` transforms MongoDB documents to frontend DTOs

### Frontend State Management

- RTK Query for server state with polling
- Redux Toolkit Entity Adapters for normalized job state
- Role-based access: Admin/Manager see all jobs, users see own

### Deployments

- **Hyperion** (SIBYLS beamline): `infra/docker-compose-hyperion.yml` — CPU workflows (Classic, Auto, Multi, SANS, Scoper)
- **NERSC**: Docker Compose / Helm — GPU workflows (Classic, Auto, AF/AlphaFold)
