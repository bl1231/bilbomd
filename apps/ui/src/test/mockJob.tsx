import type { PartialDeep } from 'type-fest'
import type { BilboMDJob } from 'types/interfaces'

export const createMockBilboMDJob = (
  overrides: PartialDeep<BilboMDJob> = {}
): BilboMDJob => {
  // Note: no `: BilboMDJob` here
  const baseJob = {
    id: '123',
    username: 'testuser',
    mongo: {
      id: '123',
      _id: '123',
      __t: 'BilboMdAlphaFold',
      title: 'Mock AlphaFold Job',
      access_mode: 'anonymous',
      public_id: 'public-123',
      status: 'Completed',
      uuid: 'abc-123',
      time_submitted: new Date(),
      time_started: new Date(),
      time_completed: new Date(),
      data_file: '',
      pdb_file: '',
      psf_file: '',
      crd_file: '',
      const_inp_file: '',
      rg: 25,
      rg_min: 20,
      rg_max: 30,
      conformational_sampling: 1,
      md_engine: 'OpenMM',
      md_constraints: {},
      openmm_parameters: {}
    },
    bullmq: {
      position: 1,
      queuePosition: '1',
      bilbomdStep: {
        minimize: 'completed',
        heat: 'completed',
        md: 'completed',
        foxs: 'completed',
        multifoxs: 'completed',
        results: 'completed',
        email: 'completed',
        numEnsembles: 1
      },
      bilbomdLastStep: 'results',
      bullmq: {
        id: 1,
        progress: '100',
        name: 'test',
        data: { type: 'pdb', title: 't', uuid: '123' }
      }
    }
  } as const

  return {
    ...baseJob,
    ...overrides,
    mongo: { ...baseJob.mongo, ...(overrides.mongo ?? {}) },
    bullmq: { ...baseJob.bullmq, ...(overrides.bullmq ?? {}) }
  } as BilboMDJob
}
