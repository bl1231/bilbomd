# BilboMD AI Coding Agent Instructions

## Architecture Overview

BilboMD is a **monorepo** for SAXS (Small Angle X-ray Scattering) molecular modeling built on **pnpm workspace + Turborepo**. It runs computationally intensive molecular dynamics pipelines using CHARMM/OpenMM and processes results through FoXS/MultiFoXS.

### Core Components

- **`apps/ui/`**: React SPA with Material-UI, Redux Toolkit Query, job management
- **`apps/backend/`**: Express.js API server, authentication, job orchestration, BullMQ queues
- **`apps/worker/`**: BullMQ job processor for MD pipelines (CHARMM/OpenMM execution)
- **`apps/scoper/`**: RNA structure analysis pipeline with deep learning (IonNet)
- **`packages/`**: Shared libraries (mongodb-schema, bilbomd-types, md-utils)

### Job Processing Architecture

**Queue-Based Processing**: Jobs flow through Redis-backed BullMQ queues:

1. **Backend** receives jobs → queues to `bilbomd`, `scoper`, or `multimd` queues
2. **Worker** processes jobs → executes MD simulations → updates MongoDB
3. **Dual Deployment**: Local execution vs NERSC HPC via SFAPI calls

### Key Workflows

**Development Build**: `pnpm dev` (runs all apps in parallel via Turbo)
**Production Build**: `pnpm build && pnpm test`
**Docker Deployment**: Multi-stage Dockerfiles with pnpm workspace optimization

## Critical Patterns

### Job Types & Pipeline Mapping

```typescript
// Job type routing pattern (apps/ui/src/features/jobs/SingleJobPage.tsx)
const jobTypeToRoute = {
  pdb: 'classic',
  crd: 'classic',
  auto: 'auto',
  scoper: 'scoper',
  alphafold: 'alphafold',
  sans: 'sans',
  multi: 'multi'
}
```

### BullMQ Queue Structure

```typescript
// Queue separation by job type (apps/backend/src/queues/index.ts)
export { bilbomdQueue } from './bilbomd.js' // Main MD jobs
export { scoperQueue } from './scoper.js' // RNA analysis
export { multimdQueue } from './multimd.js' // Multi-conformer jobs
```

### MongoDB Schema Pattern

All job types extend `IJob` base interface from `packages/mongodb-schema/` with job-specific properties. Status tracking uses standardized `StepStatusEnum` values.

### NERSC Integration

**Environment-Dependent Execution**: Set `USE_NERSC=true` to route jobs through SFAPI instead of local execution. Scripts in `apps/worker/scripts/nersc/` generate Slurm batch files for Perlmutter GPU nodes.

### Docker Multi-Stage Strategy

**Pattern**: `deps` stage (pnpm fetch) → `build` stage (install + compile) → `runtime` stage (minimal deployment). See `apps/*/bilbomd-*.dockerfile` for implementation.

## Environment Configuration

### Key Environment Variables

```bash
# Core Settings
BILBOMD_URL=http://localhost:3000
USE_NERSC=false                    # Toggle local vs NERSC execution
BILBOMD_ENV=development            # development|production
NODE_ENV=development

# NERSC Integration (when USE_NERSC=true)
SFAPI_URL=https://api.nersc.gov
SCRIPT_DIR=/path/to/nersc/scripts
UPLOAD_DIR=/global/cfs/path
WORK_DIR=/pscratch/path

# Processing Tools
CHARMM=/usr/local/bin/charmm
FOXS=/usr/bin/foxs
MULTIFOXS=/usr/bin/multi_foxs
```

### Test Configuration

Tests use Vitest with environment-specific configs. For long-running compilation tests, add timeout parameter: `it('test name', () => { /* test */ }, 30000)`

## Project-Specific Commands

### Development

```bash
pnpm dev                          # Start all services in parallel
pnpm --filter @bilbomd/backend dev # Start specific app
pnpm test                         # Run all tests
pnpm build                        # Build all packages/apps
```

### Docker Operations

```bash
# Build with correct architecture for deployment
docker buildx build --platform linux/amd64 -t bilbomd/app -f app.dockerfile .

# NERSC-specific builds (on Perlmutter)
podman-hpc build --build-arg USER_ID=$UID -t registry.nersc.gov/m4659/image .
```

### Database & Queue Management

**BullMQ Admin UI**: Available at `/admin/bullmq` in development for queue monitoring
**MongoDB**: Uses Mongoose with TypeScript schemas in `packages/mongodb-schema/`

## Integration Points

### Cross-Component Communication

- **Redis**: BullMQ queues + job state management
- **MongoDB**: Job persistence + results storage
- **File System**: Job artifacts stored in `DATA_VOL` directory structure
- **SFAPI**: NERSC Superfacility API for HPC job submission

### External Dependencies

- **CHARMM/OpenMM**: MD simulation engines
- **FoXS/MultiFoXS**: SAXS profile calculation
- **PyMOL**: Trajectory visualization
- **Pepsi-SANS**: Small-angle neutron scattering analysis

## Testing Patterns

**Unit Tests**: Standard Vitest setup with environment-specific mocks
**Integration**: Test job processing pipelines with mock queues (`apps/backend/test/queues/jobQueueMock.ts`)
**E2E**: UI testing via Testing Library with Redux store setup

When modifying job processing logic, always update corresponding queue handlers, MongoDB schemas, and UI job status displays simultaneously.
