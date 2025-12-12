# BilboMD Copilot Instructions

## Project Architecture

BilboMD is a **monorepo** for Small Angle X-ray Scattering (SAXS) modeling using molecular dynamics. It's a **turborepo** with **pnpm** workspaces containing:

- **apps/backend**: Express.js REST API server with MongoDB + Redis
- **apps/ui**: React SPA using RTK Query for state management
- **apps/worker**: Node.js job processor for MD simulations (CHARMM/OpenMM)
- **apps/scoper**: Specialized protein analysis service
- **packages/**: Shared TypeScript types, MongoDB schemas, utilities

## Key Workflows

```bash
# Development (starts all services)
pnpm dev

# Build everything
pnpm build

# Run tests
pnpm test
```

**Docker deployment** uses different compose files:

- `infra/docker-compose.local.yml` - local development
- `infra/docker-compose-nersc.yml` - NERSC GPU deployment
- `infra/docker-compose-hyperion.yml` - SIBYLS beamline deployment

## Job Processing System

BilboMD processes **7 job types** (`pdb`, `crd`, `auto`, `alphafold`, `sans`, `scoper`, `multi`) through a **Redis-based queue** (BullMQ).

**Frontend Job Flow:**

1. RTK Query (`slices/jobsApiSlice.ts`) calls backend `/jobs` endpoint
2. Jobs stored in Redux with **Entity Adapter** pattern
3. `Jobs.tsx` filters jobs by user role (Admin/Manager see all, users see own)

**Backend Job Flow:**

1. `controllers/jobs/getAllJobs.ts` queries MongoDB with role-based filtering
2. Jobs stored in both `Job` and `MultiJob` collections
3. **Critical**: Filter uses `{'user._id': user._id}` for embedded user objects, not `{user: user._id}`

**Worker Processing:**

- Worker polls Redis queue, executes MD simulations
- Supports both CHARMM and OpenMM engines
- Updates job status/progress in MongoDB during execution

## Data Architecture

**MongoDB Collections:**

- `users` - User auth and roles (Admin/Manager/User)
- `jobs` - Main job documents with embedded user objects
- `multijobs` - Multi-simulation job documents

**Frontend State:**

- RTK Query for server state with 30s polling
- Redux Toolkit for client state
- Material-UI DataGrid for job listings

## Common Patterns

**Role-based Access:**

```typescript
// Backend filtering pattern
const isAdmin = roles.includes('Admin')
const isManager = roles.includes('Manager')
let jobFilter = {}
if (!isAdmin && !isManager) {
  jobFilter = { 'user._id': user._id } // Note: embedded object pattern
}
```

**RTK Query Entity Management:**

```typescript
// Always use entity adapters for normalized state
const jobsAdapter = createEntityAdapter<BilboMDJobDTO>()
export const { selectAll: selectAllJobs } = jobsAdapter.getSelectors()
```

**Job DTO Pattern:**
Jobs are transformed from MongoDB documents to DTOs using `buildBilboMDJobDTO()` to ensure consistent frontend interface.

## Integration Points

- **NERSC**: Slurm job submission for GPU-accelerated simulations
- **SIBYLS Beamline**: Local compute for CPU-based workflows
- **External Tools**: CHARMM, OpenMM, FoXS, MultiFoXS integration via worker
- **Authentication**: JWT-based with refresh token pattern

## Coding Standards & Style

**TypeScript Rules:**

- **Never use `any`** - use proper types, `unknown`, or generics instead
- Prefer **functional programming** over classes when possible
- Use **arrow functions** for consistency: `const myFunc = () => {}`

**Testing Requirements:**

- **Write unit tests** for all new code
- Place test files in `__tests__` directories **within each module/directory**
- Uses `vitest` for testing.
- **Don't use** a single `tests` folder at src root
- Example structure: `src/controllers/jobs/__tests__/getAllJobs.test.ts`

## Testing Guidelines & Best Practices

**Vitest Framework Patterns:**

```typescript
// Always import vi from vitest for mocking
import { vi } from 'vitest'

// Use vi functions instead of jest equivalents
vi.mock('../../path/to/module')
vi.fn()
vi.clearAllMocks()
vi.useFakeTimers()
vi.setSystemTime()
vi.advanceTimersByTime()
```

**Jest to Vitest Migration Checklist:**

- [ ] Add `import { vi } from 'vitest'`
- [ ] Replace `jest.mock()` → `vi.mock()`
- [ ] Replace `jest.fn()` → `vi.fn()`
- [ ] Replace `jest.clearAllMocks()` → `vi.clearAllMocks()`
- [ ] Replace timer functions: `jest.useFakeTimers()` → `vi.useFakeTimers()`
- [ ] Update mock paths to be relative to test file location
- [ ] Verify all tests pass after conversion

**React Component Testing Best Practices:**

```typescript
// Prefer behavior testing over implementation details
// ✅ Good: Test what user sees/does
expect(screen.getByText('Submit')).toBeInTheDocument()
expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()

// ❌ Avoid: Testing internal state or implementation
expect(component.state.isSubmitting).toBe(false)
```

**Element Selection Strategy:**

1. **Prefer accessible queries**: `getByRole()`, `getByLabelText()`, `getByText()`
2. **Use data-testid sparingly**: Only when semantic queries aren't sufficient
3. **Handle multiple elements**: Use `getAllByRole()[0]` for first match when needed
4. **Text matching**: Use regex `/partial text/` for flexibility with dynamic content

**Mocking Guidelines:**

```typescript
// Mock at module level, not individual functions
vi.mock('../../hooks/useJobProperties', () => ({
  useJobProperties: vi.fn()
}))

// Use proper relative paths from test file location
// Test in: src/features/jobs/__tests__/
// Mock path: '../../hooks/someHook' (not '../hooks/someHook')

// Mock complex components that aren't under test
vi.mock('../../components/ComplexComponent', () => ({
  ComplexComponent: () => null
}))

// Handle mocks that need different behaviors per test
const mockHandler = vi.fn()
beforeEach(() => {
  mockHandler.mockReturnValue({ data: 'test' })
})
```

**Test Organization Patterns:**

```typescript
describe('ComponentName', () => {
  // Group related test data
  const defaultProps = { /* common props */ }

  const renderComponent = (props = {}) =>
    render(<Component {...defaultProps} {...props} />)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when loading', () => {
    it('shows loading indicator', () => {
      // Test loading state
    })
  })

  describe('when error occurs', () => {
    it('displays error message', () => {
      // Test error state
    })
  })
})
```

**Common Test Antipatterns to Avoid:**

- Testing component implementation details instead of user-visible behavior
- Overly complex mocks that recreate entire modules
- Tests that break when UI text changes (use semantic queries)
- Missing cleanup in beforeEach/afterEach hooks
- Testing multiple concerns in a single test case

**Async Testing Best Practices:**

```typescript
// Use waitFor for async updates
await waitFor(() => {
  expect(screen.getByText('Updated content')).toBeInTheDocument()
})

// Use findBy* queries for elements that appear asynchronously
const submitButton = await screen.findByRole('button', { name: /submit/i })

// Mock timers for time-dependent tests
vi.useFakeTimers()
vi.setSystemTime(new Date('2023-01-01'))
// ... test time-dependent behavior
vi.useRealTimers()
```

**Code Organization:**

```typescript
// Preferred: Functional approach with arrow functions
const processJob = (job: BilboMDJobDTO): ProcessedJob => {
  // implementation
}

// Avoid: Classes and function declarations when arrow functions work
```
