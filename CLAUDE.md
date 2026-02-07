# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is BilboMD?

BilboMD is a SAXS (Small Angle X-ray Scattering) modeling platform that uses molecular dynamics (CHARMM/OpenMM) to generate molecular models, calculates theoretical SAXS curves via FoXS, and finds best-fit ensembles via MultiFoXS. It supports 7 job types: `pdb`, `crd`, `auto`, `alphafold`, `sans`, `scoper`, `multi`.

## Monorepo Structure

Turborepo + pnpm workspaces. Node v24.13.0 (see `.nvmrc`).

**Apps:**

- `apps/backend` (`@bilbomd/backend`) — Express.js REST API with MongoDB + Redis, JWT auth, BullMQ job queue
- `apps/ui` (`@bilbomd/ui`) — React SPA with RTK Query, Material-UI, Formik, Recharts, Molstar
- `apps/worker` (`@bilbomd/worker`) — Node.js BullMQ job processor running MD simulations, supports both local (Hyperion) and NERSC/Perlmutter (Slurm) execution
- `apps/scoper` (`@bilbomd/scoper`) — Specialized worker for Mg2+ ion prediction in RNA

**Packages:**

- `packages/bilbomd-types` (`@bilbomd/bilbomd-types`) — Shared TypeScript type definitions
- `packages/mongodb-schema` (`@bilbomd/mongodb-schema`) — Mongoose schemas with dual exports: `@bilbomd/mongodb-schema` (full, for backend/worker) and `@bilbomd/mongodb-schema/frontend` (frontend-safe subset)
- `packages/md-utils` (`@bilbomd/md-utils`) — Molecular dynamics constraint utilities
- `packages/eslint-config` (`@bilbomd/eslint-config`) — Shared ESLint config

## Build & Dev Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build everything (turbo, respects dependency order)
pnpm dev              # Start all services in dev mode (parallel)
pnpm lint             # Lint all packages
pnpm test             # Run all tests
pnpm format           # Format with prettier
pnpm format:check     # Check formatting
```

### Per-package commands

```bash
# Filter to a specific package
pnpm -F @bilbomd/backend run dev
pnpm -F @bilbomd/ui run dev
pnpm test --filter @bilbomd/backend
pnpm test --filter @bilbomd/ui

# Backend-specific
pnpm -F @bilbomd/backend run test:watch
pnpm -F @bilbomd/backend run test:integration

# UI-specific
pnpm -F @bilbomd/ui run test:watch
pnpm -F @bilbomd/ui run test:ui          # Vitest UI
```

### Docker (local dev)

```bash
cd infra
./build.sh local     # Build local Docker images
./run.sh local       # Start all services via docker-compose.local.yml
```

Environment: copy `infra/.env.example` to `infra/.env.local`.

## Testing

- Framework: **Vitest** for all packages. React Testing Library for UI components.
- Place test files in `__tests__` directories within each module, not at project root.
  - Example: `src/controllers/jobs/__tests__/getAllJobs.test.ts`
- Do not use `--reporter=verbose` flag.
- Use `vi` from vitest for mocking (not jest globals).

## Code Style

- **Prettier** config: no semicolons, single quotes, no trailing commas, 80-char width, `singleAttributePerLine: true`
- Prefer **arrow functions**: `const myFunc = () => {}`
- Avoid `any` — use proper types or generics
- Prefer functional patterns over classes
- All modules use ESM (`"type": "module"`)
- TypeScript target: ES2022, module: NodeNext

## Versioning

Uses **Changesets** for per-package versioning. After code changes:

```bash
pnpm changeset        # Select packages, choose semver bump, write summary
```

Changesets are applied on merge to `main`, producing git tags and Docker image semver tags. `updateInternalDependencies: "patch"` is enabled — bumping an internal package auto-bumps dependents.

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
