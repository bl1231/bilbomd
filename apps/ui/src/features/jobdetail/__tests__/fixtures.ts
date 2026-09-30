import type { JobStepsDTO } from '@bilbomd/bilbomd-types'
import type { JobView } from '../jobView'

export const makeView = (overrides: Partial<JobView> = {}): JobView => ({
  id: 'job-1',
  jobType: 'pdb',
  title: 'My Job',
  uuid: 'uuid-1234',
  status: 'Completed',
  progress: 100,
  md_engine: 'OpenMM',
  submittedAt: new Date('2026-09-01T10:00:00Z'),
  startedAt: new Date('2026-09-01T10:01:00Z'),
  completedAt: new Date('2026-09-01T11:01:00Z'),
  inputs: { data_file: 'saxs.dat', pdb_file: 'model.pdb' },
  ...overrides
})

export const runningSteps = {
  minimize: {
    status: 'Success',
    message: 'Minimized',
    started_at: new Date('2026-09-01T10:01:00Z'),
    completed_at: new Date('2026-09-01T10:03:00Z'),
    duration_ms: 120_000
  },
  heat: { status: 'Success', message: 'Heated', duration_ms: 65_000 },
  md: {
    status: 'Running',
    message: 'MD run 2 of 4',
    started_at: new Date('2026-09-01T10:04:00Z')
  },
  foxs: { status: 'Waiting', message: '' },
  // Skipped for pdb jobs while still Waiting
  pae: { status: 'Waiting', message: '' },
  nersc_job_status: { status: 'Waiting', message: '' },
  nersc_prepare_slurm_batch: { status: 'Success', message: 'prepared' }
} as unknown as JobStepsDTO
