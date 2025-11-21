import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import JobSummary from '../JobSummary'
import { renderWithProviders } from 'test/rendersWithProviders'
import type {
  BilboMDJobDTO,
  BilboMDCRDDTO,
  JobStatusEnum
} from '@bilbomd/bilbomd-types'

function createMockCRDJob(
  overrides: Partial<BilboMDCRDDTO> = {}
): BilboMDCRDDTO {
  return {
    id: 'mongo-id',
    jobType: 'crd',
    uuid: 'mock-uuid',
    title: '51-crd-test',
    access_mode: 'anonymous',
    public_id: 'public-123',
    status: 'Completed',
    time_submitted: new Date('2025-05-01T22:48:55.154Z'),
    time_started: new Date(),
    time_completed: new Date(),
    data_file: 'pro_dna_saxs.dat',
    md_engine: 'CHARMM',
    progress: 100,
    cleanup_in_progress: false,
    const_inp_file: 'const.inp',
    crd_file: 'pro_dna_complex.crd',
    psf_file: 'pro_dna_complex.psf',
    conformational_sampling: 1,
    rg: 27,
    rg_min: 22,
    rg_max: 41,
    ...overrides
  } as BilboMDCRDDTO
}

type BilboMDJob = BilboMDJobDTO & {
  bullmq: {
    position: number
    queuePosition: string
    bilbomdStep: Record<string, string>
    bilbomdLastStep: string
    bullmq: {
      id: number
      progress: string
      name: string
      data: Record<string, unknown>
    }
  }
}

const baseJob: BilboMDJob = {
  id: '6813fa574cc02e4a465ab1b7',
  username: 'scott',
  mongo: createMockCRDJob(),
  bullmq: {
    position: 0,
    queuePosition: '0',
    bilbomdStep: {
      minimize: 'Success',
      heat: 'Success',
      md: 'Success',
      foxs: 'Success',
      pae: 'Success',
      multifoxs: 'Success',
      results: 'Success',
      email: 'Success',
      numEnsembles: '1'
    },
    bilbomdLastStep: 'step1',
    bullmq: {
      id: 123,
      progress: '100%',
      name: 'job-name',
      data: {
        type: 'mock-type',
        title: 'mock-title',
        uuid: 'mock-uuid'
      }
    }
  }
}

describe('JobSummary', () => {
  it('renders job title', () => {
    renderWithProviders(<JobSummary job={baseJob} />)
    expect(screen.getByText(/51-crd-test/i)).toBeInTheDocument()
  })

  it('renders JobDetails component', () => {
    renderWithProviders(<JobSummary job={baseJob} />)

    expect(screen.getByRole('link', { name: /details/i })).toBeInTheDocument()
  })

  it('renders DeleteJob when job is not running or submitted', () => {
    renderWithProviders(<JobSummary job={baseJob} />)
    expect(screen.getByRole('button', { name: /trash/i })).toBeInTheDocument()
  })

  it('disables DeleteJob with tooltip when job is running', async () => {
    const runningJob = {
      ...baseJob,
      mongo: { ...baseJob.mongo, status: 'Running' as JobStatusEnum }
    }
    renderWithProviders(<JobSummary job={runningJob} />)
    const deleteButton = screen.getByRole('button', { name: /trash/i })
    expect(deleteButton).toBeDisabled()
  })

  it('disables DeleteJob with tooltip when job is submitted', async () => {
    const submittedJob = {
      ...baseJob,
      mongo: { ...baseJob.mongo, status: 'Submitted' as JobStatusEnum }
    }
    renderWithProviders(<JobSummary job={submittedJob} />)
    const deleteButton = screen.getByRole('button', { name: /trash/i })
    expect(deleteButton).toBeDisabled()
  })
})
