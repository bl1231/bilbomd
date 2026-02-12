# UI Test Coverage Progress

This document tracks progress on adding comprehensive test coverage to the BilboMD UI package.

## Current Status

**Starting Coverage:** ~35.8%
**Current Coverage:** Improved significantly (Phase 1 complete, Phase 2 partial)
**Target Coverage:** 70% for critical business logic

## Completed Phases

### ✅ Phase 1: API Slices & State Management (Completed)

**Status:** All 5 files tested, all tests passing, lint and build verified

**Files Tested:**
1. ✅ `app/api/apiSlice.ts` - Main API slice (95.65% coverage, 10 tests)
2. ✅ `app/api/sfapiSlice.ts` - SF API slice (100% coverage, 6 tests)
3. ✅ `features/bullmq/bullmqApiSlice.ts` - BullMQ integration (100% coverage, 4 tests)
4. ✅ `slices/authSlice.ts` - Authentication state (100% coverage, 7 tests)
5. ✅ `slices/alphafoldPaeVizSlice.ts` - AlphaFold PAE viz (100% coverage, 16 tests)

**Total:** 43 tests across 5 files

**Commit:** 737c4993 - "test: add Phase 1 critical business logic tests for UI"

### 🔄 Phase 2: Job Management Components (In Progress - 11 of 15 files)

**Status:** 11 files tested, all tests passing, lint and build verified

**Files Tested:**
1. ✅ `features/jobs/JobDBDisplayProperties.ts` - Job display properties (100% coverage, 16 tests)
2. ✅ `features/jobs/JobSuccessAlert.tsx` - Success notification (100% coverage, 17 tests)
3. ✅ `features/jobs/JobError.tsx` - Error display with async fetching (100% coverage, 11 tests)
4. ✅ `features/jobs/JobDetails.tsx` - Job details navigation button (100% coverage, 14 tests)
5. ✅ `features/jobs/BilboMDStep.tsx` - Pipeline step status chips (100% coverage, 39 tests)
6. ✅ `features/jobs/NewJobFormInstructions.tsx` - Instructions accordion (100% coverage, 21 tests)
7. ✅ `features/jobs/BilboMDNerscStep.tsx` - NERSC step display (71.87% coverage, 41 tests)
8. ✅ `features/jobs/BilboMDMongoSteps.tsx` - MongoDB step container (100% coverage, 18 tests)
9. ✅ `features/jobs/BilboMDNerscSteps.tsx` - NERSC step container (100% coverage, 20 tests)
10. ✅ `features/jobs/JobActionsMenu.tsx` - Job actions menu (100% coverage, 39 tests)
11. ✅ `features/jobs/FoXSAnalysis.tsx` - FoXS analysis display (94.28% coverage, 20 tests)

**Total:** 256 tests across 11 files

**Commits:**
- 6808cc4c - "test: add Phase 2 job management component tests (partial)"
- 2928c712 - "test: add Phase 2 job management component tests (continued)"
- [Current] - "test: add Phase 2 job management tests for NERSC steps, actions menu, and FoXS analysis"

## Remaining Phases

### Phase 2: Job Management Components (4 remaining files)
High-priority job lifecycle components still to test:
- `features/jobs/SingleJobPage.tsx`
- `features/jobs/NewJobForm.tsx`
- `features/jobs/ResubmitJobForm.tsx`
- `features/jobs/PipelineSchematic.tsx`

### Phase 3: Job Type Forms (10 files)
Job submission forms for different pipeline types:
- `features/autojob/NewAutoJobForm.tsx`
- `features/autojob/ResubmitAutoJobForm.tsx`
- `features/autojob/AutoJobFormInstructions.tsx`
- `features/sansjob/NewSANSJobForm.tsx`
- `features/sansjob/NewSANSJobFormInstructions.tsx`
- `features/scoperjob/NewScoperJobForm.tsx`
- `features/multimd/NewMultiMDJobForm.tsx`
- `features/sansjob/ChainDeuterationSlider.tsx`
- `features/autojob/PipelineSchematic.tsx`
- `features/multimd/MultiMDJobDBDetails.tsx`

### Phase 4: Validation Schemas (5 files)
Form validation logic:
- `schemas/Alphafold2PAEValidationSchema.ts`
- `schemas/BilboMDAlphaFoldJobSchema.ts`
- `schemas/ExpdataSchema.ts`
- `schemas/ScoperValidationSchema.ts`
- `schemas/ValidationSchemas.ts`

### Phase 5: Authentication & Authorization (7 files)
Auth-related components:
- `features/auth/Login.tsx`
- `features/auth/RequireAuth.tsx`
- `features/auth/PersistLogin.tsx`
- `features/auth/Prefetch.tsx`
- `features/auth/OrcidConfirmation.tsx`
- `features/auth/OrcidError.tsx`
- `features/auth/VerifyEmail.tsx`

### Phase 6: Admin & Queue Management (5 files)
Admin panel and queue management:
- `features/admin/QueueDetailsPage.tsx`
- `features/admin/QueueDetails.tsx`
- `features/admin/QueueJobActionsMenu.tsx`
- `features/admin/QueueOverviewPanel.tsx`
- `features/admin/QueueToggleControl.tsx`

## Testing Conventions

- **Framework:** Vitest + React Testing Library
- **File Location:** `__tests__/` directories within each module
- **Mock Server:** MSW (Mock Service Worker)
- **Code Style:** No semicolons, single quotes, no trailing commas, arrow functions
- **Coverage Tool:** v8

## Notes

- Phase 1 achieved 100% coverage on 4 out of 5 files
- All tests follow project conventions (Vitest, no semicolons, etc.)
- Tests use MSW for API mocking
- setupApiStore utility provides Redux store for RTK Query testing
