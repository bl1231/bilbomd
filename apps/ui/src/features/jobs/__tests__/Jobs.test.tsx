import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from 'test/rendersWithProviders'
import Jobs from '../Jobs'
import { server } from 'test/server'
import { http, HttpResponse } from 'msw'
import type {
  BilboMDJobDTO,
  BilboMDPDBDTO,
  BilboMDScoperDTO
} from '@bilbomd/bilbomd-types'
import useAuth from 'hooks/useAuth'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
// Local type for mocking the configs query hook
type MockConfigsQueryResult = {
  data: { useNersc: string }
  error: null
  isLoading: boolean
  refetch: () => void
}

vi.mock('hooks/useAuth', () => ({
  default: vi.fn(() => ({
    username: 'testuser',
    roles: [] as string[],
    status: 'User',
    isManager: false,
    isAdmin: false,
    email: 'testuser@example.com',
    isAuthenticated: true
  }))
}))

vi.mock('slices/configsApiSlice', () => {
  const defaultReturn: MockConfigsQueryResult = {
    data: { useNersc: 'false' },
    error: null,
    isLoading: false,
    refetch: vi.fn()
  }
  const useGetConfigsQuery = vi.fn<() => MockConfigsQueryResult>(
    () => defaultReturn
  )
  return { useGetConfigsQuery }
})

const createMockPdbMongo = (
  overrides: Partial<BilboMDPDBDTO> = {}
): BilboMDPDBDTO => ({
  id: 'mongo-id-1',
  jobType: 'pdb',
  title: 'Mock PDB Job',
  uuid: 'mock-uuid-1',
  access_mode: 'user',
  public_id: 'public-1',
  status: 'Completed',
  data_file: 'mock.dat',
  md_engine: 'OpenMM',
  time_submitted: new Date('2025-01-01T00:00:00Z'),
  time_started: new Date('2025-01-01T00:05:00Z'),
  time_completed: new Date('2025-01-01T00:10:00Z'),
  progress: 100,
  cleanup_in_progress: false,
  pdb_file: 'model.pdb',
  const_inp_file: 'const.inp',
  conformational_sampling: 1,
  rg: 25,
  rg_min: 20,
  rg_max: 35,
  ...overrides
})

const createMockJobDTO = (
  overrides: Partial<BilboMDJobDTO> = {}
): BilboMDJobDTO => ({
  id: 'job-1',
  username: 'testuser',
  mongo: createMockPdbMongo(),
  ...overrides
})

const createMockScoperMongo = (
  overrides: Partial<BilboMDScoperDTO> = {}
): BilboMDScoperDTO => ({
  id: 'mongo-id-scoper',
  jobType: 'scoper',
  title: 'Mock Scoper Job',
  uuid: 'mock-uuid-scoper',
  access_mode: 'user',
  public_id: 'public-scoper',
  status: 'Completed',
  data_file: 'mock.dat',
  time_submitted: new Date('2025-01-01T00:00:00Z'),
  time_started: new Date('2025-01-01T00:05:00Z'),
  time_completed: new Date('2025-01-01T00:10:00Z'),
  progress: 100,
  cleanup_in_progress: false,
  pdb_file: 'model.pdb',
  fixc1c2: false,
  ...overrides
})

import type { INerscInfo } from '@bilbomd/mongodb-schema/frontend'
describe('Jobs table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default config: non-NERSC path
    vi.mocked(useGetConfigsQuery).mockReturnValue({
      data: { useNersc: 'false' },
      error: null,
      isLoading: false,
      refetch: vi.fn()
    })
  })
  it('renders the Engine column header', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([createMockJobDTO()])
      })
    )

    renderWithProviders(<Jobs />)

    const engineHeader = await screen.findByRole('columnheader', {
      name: /engine/i
    })
    expect(engineHeader).toBeInTheDocument()
  })

  it('shows the md_engine value in the grid', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([
          createMockJobDTO({
            mongo: createMockPdbMongo({ md_engine: 'CHARMM' })
          })
        ])
      })
    )

    renderWithProviders(<Jobs />)

    // Assert a cell with the engine value renders
    const engineCell = await screen.findByText('CHARMM')
    expect(engineCell).toBeInTheDocument()
  })

  it('shows KGSRNA in Engine column for scoper jobs', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([
          createMockJobDTO({
            mongo: createMockScoperMongo()
          })
        ])
      })
    )

    renderWithProviders(<Jobs />)

    const engineCell = await screen.findByText('KGSRNA')
    expect(engineCell).toBeInTheDocument()
  })

  it('shows User → Engine → Status order for admins', async () => {
    vi.mocked(useAuth).mockReturnValue({
      username: 'admin',
      roles: ['Admin'],
      status: 'Admin',
      isManager: false,
      isAdmin: true,
      email: 'admin@example.com',
      isAuthenticated: true
    })

    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([createMockJobDTO()])
      })
    )

    renderWithProviders(<Jobs />)

    const headers = await screen.findAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim() || '')
    const userIdx = headerTexts.findIndex((t) => t === 'User')
    const engineIdx = headerTexts.findIndex((t) => t === 'Engine')
    const statusIdx = headerTexts.findIndex((t) => t === 'Status')
    expect(userIdx).toBeGreaterThan(-1)
    expect(engineIdx).toBeGreaterThan(-1)
    expect(statusIdx).toBeGreaterThan(-1)
    expect(userIdx).toBeLessThan(engineIdx)
    expect(engineIdx).toBeLessThan(statusIdx)
  })

  it('renders NERSC columns and queue/run times when enabled', async () => {
    vi.mocked(useGetConfigsQuery).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false,
      refetch: vi.fn()
    })

    const nerscTimes: INerscInfo = {
      time_submitted: new Date('2025-01-01T00:00:00Z'),
      time_started: new Date('2025-01-01T00:05:00Z'),
      time_completed: new Date('2025-01-01T00:15:00Z'),
      jobid: '12345',
      state: 'RUNNING',
      qos: 'debug'
    }

    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([
          createMockJobDTO({
            mongo: createMockPdbMongo({
              status: 'Running',
              nersc: nerscTimes
            })
          })
        ])
      })
    )

    renderWithProviders(<Jobs />)

    // Headers present
    expect(
      await screen.findByRole('columnheader', { name: /queue time/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /run time/i })
    ).toBeInTheDocument()

    // Cells show computed durations
    expect(await screen.findByText(/5min/i)).toBeInTheDocument()
    expect(screen.getByText(/10min/i)).toBeInTheDocument()
  })

  it('handles NERSC jobs with epoch placeholder for time_completed', async () => {
    vi.mocked(useGetConfigsQuery).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false,
      refetch: vi.fn()
    })

    const nerscTimesWithEpoch: INerscInfo = {
      time_submitted: new Date('2025-01-01T00:00:00Z'),
      time_started: new Date('2025-01-01T00:05:00Z'),
      time_completed: new Date(0), // Epoch placeholder - job not completed
      jobid: '12345',
      state: 'RUNNING',
      qos: 'debug'
    }

    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([
          createMockJobDTO({
            mongo: createMockPdbMongo({
              status: 'Running',
              nersc: nerscTimesWithEpoch
            })
          })
        ])
      })
    )

    renderWithProviders(<Jobs />)

    // Headers present
    expect(
      await screen.findByRole('columnheader', { name: /queue time/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /run time/i })
    ).toBeInTheDocument()

    // Queue time should show (5 minutes from submit to start)
    expect(await screen.findByText('5min')).toBeInTheDocument()

    // Run time should NOT show 'Invalid' - it should calculate from start to now
    // Since the job is Running, it uses current time as end
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument()
  })

  describe('with multiple jobs', () => {
    const job1 = createMockJobDTO({
      mongo: createMockPdbMongo({
        title: 'PDB Job',
        jobType: 'pdb',
        status: 'Completed'
      })
    })
    const job2 = createMockJobDTO({
      id: 'job-2',
      username: 'other',
      mongo: createMockPdbMongo({
        title: 'AUTO Job',
        jobType: 'auto',
        status: 'Running'
      })
    })

    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        username: 'admin',
        roles: ['Admin'],
        status: 'Admin',
        isManager: false,
        isAdmin: true,
        email: 'admin@example.com',
        isAuthenticated: true
      })
      server.use(
        http.get('http://localhost:3003/api/v1/jobs', () => {
          return HttpResponse.json([job1, job2])
        })
      )
    })

    it('filters by Job Type', async () => {
      renderWithProviders(<Jobs />)
      expect(await screen.findByText(/2 jobs?/i)).toBeInTheDocument()

      const typeCombo = screen.getByRole('combobox', { name: /job type/i })
      await userEvent.click(typeCombo)
      const listbox = await screen.findByRole('listbox')
      await userEvent.click(
        within(listbox).getByRole('option', { name: 'pdb' })
      )

      expect(await screen.findByText(/1 job/i)).toBeInTheDocument()
    })

    it('filters by Status', async () => {
      renderWithProviders(<Jobs />)
      expect(await screen.findByText(/2 jobs?/i)).toBeInTheDocument()

      const statusCombo = screen.getByRole('combobox', { name: /status/i })
      await userEvent.click(statusCombo)
      const statusList = await screen.findByRole('listbox')
      await userEvent.click(
        within(statusList).getByRole('option', { name: 'Completed' })
      )
      expect(await screen.findByText(/1 job/i)).toBeInTheDocument()
    })

    it('resets filters', async () => {
      renderWithProviders(<Jobs />)
      expect(await screen.findByText(/2 jobs?/i)).toBeInTheDocument()

      // Apply a filter
      const typeCombo = screen.getByRole('combobox', { name: /job type/i })
      await userEvent.click(typeCombo)
      const listbox = await screen.findByRole('listbox')
      await userEvent.click(
        within(listbox).getByRole('option', { name: 'pdb' })
      )
      expect(await screen.findByText(/1 job/i)).toBeInTheDocument()

      // Reset filters restores all
      await userEvent.click(
        screen.getByRole('button', { name: /reset filters/i })
      )
      expect(await screen.findByText(/2 jobs?/i)).toBeInTheDocument()
    })
  })

  it('opens Delete dialog from More Actions menu', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([
          createMockJobDTO({
            mongo: createMockPdbMongo({ title: 'Deletable Job' })
          })
        ])
      })
    )

    renderWithProviders(<Jobs />)

    const moreBtn = await screen.findByRole('button', { name: /more actions/i })
    await userEvent.click(moreBtn)

    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i })
    await userEvent.click(deleteItem)

    const dialog = await screen.findByRole('dialog', {
      name: /confirm delete/i
    })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/deletable job/i)).toBeInTheDocument()

    // Close dialog and ensure it disappears
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /confirm delete/i })
      ).not.toBeInTheDocument()
    })
  })

  it('shows empty-state info alert when no jobs', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<Jobs />)

    expect(await screen.findByText(/no jobs found/i)).toBeInTheDocument()
  })

  it('shows empty-state when backend returns 204 No Content', async () => {
    server.use(
      http.get('http://localhost:3003/api/v1/jobs', () => {
        return new Response(null, { status: 204 })
      })
    )

    renderWithProviders(<Jobs />)

    // RTK Query treats 204 as success with empty data
    expect(await screen.findByText(/no jobs found/i)).toBeInTheDocument()
  })
})
