# Changeset: Store Job Usage Events in MongoDB and Expose Admin Analytics

Branch: `238-store-job-stats-in-mongodb`
Date: 2025-12-15

## Summary
This changeset introduces end-to-end **usage analytics** across the BilboMD stack:
- Records job lifecycle usage events (submitted, started, completed, failed, cancelled) with context (access mode, user, IP hash, NERSC metadata).
- Adds a `UsageEvent` MongoDB model + interfaces with indexes for analytics.
- Implements Admin Analytics API endpoints for summaries and aggregations.
- Wires Worker and Scoper pipelines to emit usage events.
- Integrates a new RTK Query slice in the UI to consume analytics.
- Adds documentation for analytics aggregation patterns.

## Backend
- Routing:
  - [apps/backend/src/app.ts](apps/backend/src/app.ts#L115): Mounts `admin/analytics` router.
  - [apps/backend/src/routes/admin-analytics.ts](apps/backend/src/routes/admin-analytics.ts): Protected Admin/Manager analytics endpoints.
- Controllers (new):
  - [Summary](apps/backend/src/controllers/admin/analytics/summary.ts): User/job counts + usage per pipeline.
  - [Jobs by User](apps/backend/src/controllers/admin/analytics/jobsByUser.ts)
  - [Jobs by Type](apps/backend/src/controllers/admin/analytics/jobsByType.ts)
  - [Jobs by Status](apps/backend/src/controllers/admin/analytics/jobsByStatus.ts)
  - [Jobs Time Series](apps/backend/src/controllers/admin/analytics/jobsTimeSeries.ts)
  - [Usage Per Pipeline](apps/backend/src/controllers/admin/analytics/usagePerPipeline.ts)
  - [Usage Success Rate](apps/backend/src/controllers/admin/analytics/usageSuccessRate.ts)
  - [Usage Duration Stats](apps/backend/src/controllers/admin/analytics/usageDurationStats.ts)
  - [Access Mode Split](apps/backend/src/controllers/admin/analytics/usageAccessModeSplit.ts)
  - Re-exports in [index](apps/backend/src/controllers/admin/analytics/index.ts)
- Usage Event Service:
  - [apps/backend/src/services/usageEvents.ts](apps/backend/src/services/usageEvents.ts): `recordUsageEvent()` to persist events.
- Job submission logging:
  - [Authenticated](apps/backend/src/controllers/jobs/createJob.ts#L118-L135): `job_submitted` with user context.
  - [Anonymous](apps/backend/src/controllers/jobs/createJob.ts#L260-L270): `job_submitted` with `publicId` + `clientIpHash`.

## Worker
- Helpers:
  - [apps/worker/src/services/functions/usageEvents.ts](apps/worker/src/services/functions/usageEvents.ts): `buildContext()`, `recordWorkerUsageEvent()`, `toPipeline()`.
- Pipelines: start/complete events added
  - Auto: [start](apps/worker/src/services/pipelines/bilbomd-auto.ts#L42-L56), [complete](apps/worker/src/services/pipelines/bilbomd-auto.ts#L209-L225)
  - CRD: [start](apps/worker/src/services/pipelines/bilbomd-crd.ts#L32-L46), [complete](apps/worker/src/services/pipelines/bilbomd-crd.ts#L130-L146)
  - PDB: [start](apps/worker/src/services/pipelines/bilbomd-pdb.ts#L44-L58), [complete](apps/worker/src/services/pipelines/bilbomd-pdb.ts#L177-L193)
  - SANS: [start](apps/worker/src/services/pipelines/bilbomd-sans.ts#L40-L54), [complete](apps/worker/src/services/pipelines/bilbomd-sans.ts#L182-L198)
  - Multi: [start](apps/worker/src/services/pipelines/bilbomd-multi.ts#L24-L38), [complete](apps/worker/src/services/pipelines/bilbomd-multi.ts#L64-L80)
- NERSC:
  - Submission: [apps/worker/src/services/pipelines/bilbomd-nersc.ts#L55-L75] with NERSC metadata; failure path [L75-L98].
  - Monitor: terminal and running events in [apps/worker/src/workers/bilboMdNerscJobMonitor.ts#L167-L205], [L217-L239], [L255-L267].
- Dependency:
  - Added `@bilbomd/bilbomd-types` to [apps/worker/package.json](apps/worker/package.json#L31-L36); lockfile updated.

## Scoper
- Helpers:
  - [apps/scoper/src/functions/usageEvents.ts](apps/scoper/src/functions/usageEvents.ts): `buildContext()`, `recordWorkerUsageEvent()`.
- Integration:
  - Start & complete events in [apps/scoper/src/process.bilbomdscoper.ts#L24-L39], [L58-L79].

## UI
- RTK Query Slice:
  - [apps/ui/src/slices/analyticsApiSlice.ts](apps/ui/src/slices/analyticsApiSlice.ts): Endpoints for all admin analytics.
- Store wiring:
  - Reducer/middleware added in [apps/ui/src/app/store.ts#L1-L7], [L15-L20].

## MongoDB Schema
- Interfaces:
  - New usage event interface [packages/mongodb-schema/src/interfaces/usageEventInterface.ts](packages/mongodb-schema/src/interfaces/usageEventInterface.ts) with `PipelineType`, `EventType`, `IUsageEventContext`, `IUsageEvent`.
  - Re-exports in [interfaces.ts](packages/mongodb-schema/src/interfaces.ts#L8) and [interfaces/index.ts](packages/mongodb-schema/src/interfaces/index.ts#L8).
- Model:
  - [packages/mongodb-schema/src/models/UsageEvent.ts](packages/mongodb-schema/src/models/UsageEvent.ts): Schema + indexes; exported in [models.ts](packages/mongodb-schema/src/models.ts#L4-L5) and [models/index.ts](packages/mongodb-schema/src/models/index.ts#L7).
- Indexing:
  - Compound index `{ pipeline: 1, event_type: 1, timestamp: -1 }` for analytics.

## Shared Types
- DTOs:
  - Usage event DTOs [packages/bilbomd-types/src/usage-events.ts](packages/bilbomd-types/src/usage-events.ts) and aggregation DTOs [packages/bilbomd-types/src/aggregations.ts](packages/bilbomd-types/src/aggregations.ts).
  - Exported via [index.ts](packages/bilbomd-types/src/index.ts#L1-L3). Package.json formatting updated.

## Documentation
- New guide: [docs/usage-analytics.md](docs/usage-analytics.md) with common aggregation pipelines and index guidance.

## Miscellaneous
- Copilot instructions wording tweak: [.github/copilot-instructions.md](.github/copilot-instructions.md#L101-L104).
- tsconfig: Removed `rootDir` in [tsconfig.json](tsconfig.json#L13-L17) to relax build output constraints.

## Behavioral Changes
- Usage events emitted across backend, worker, scoper for job lifecycle and NERSC actions, including durations and context.
- Admin analytics API provides aggregated stats for dashboards.
- UI can fetch analytics via RTK Query.
- New `UsageEvent` collection; indexes for performant queries.

## Security & Access
- Admin analytics endpoints protected by `verifyJWT` and `verifyRoles('Admin','Manager')`.
- Anonymous usage recording avoids storing raw IP; uses hashed client IP.

## Migration / Ops
- Ensure MongoDB creates `UsageEvent` collection and indexes on first use.
- No breaking changes to existing APIs; new endpoints only.

## Testing Suggestions
- Backend: unit tests for each analytics controller, including error paths and role guard.
- Worker/Scoper: verify event emission on start/complete/fail; duration calculation.
- UI: endpoint contracts via RTK Query mocks; add admin dashboard views in a follow-up PR.

## PR Checklist
- [ ] Verify indexes exist in production DB
- [ ] Smoke-test admin analytics endpoints behind Admin/Manager auth
- [ ] Validate usage events for both authenticated and anonymous flows
- [ ] Confirm UI can query analytics successfully
