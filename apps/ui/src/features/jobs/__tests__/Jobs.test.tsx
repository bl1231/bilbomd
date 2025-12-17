import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import Jobs from '../Jobs'
import { server } from 'test/server'
import { http, HttpResponse } from 'msw'
import type { BilboMDJobDTO, BilboMDPDBDTO } from '@bilbomd/bilbomd-types'

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

describe('Jobs table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
