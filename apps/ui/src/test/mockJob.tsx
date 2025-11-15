import { BilboMDJob } from 'types/interfaces'

export const createMockBilboMDJob = (
  overrides: Partial<BilboMDJob> = {}
): BilboMDJob => {
  const baseJob: BilboMDJob = {
    id: '123',
    username: 'testuser',
    mongo: {
      id: '123',
      __t: 'BilboMdPDB',
      uuid: 'abc-123',
      time_submitted: new Date(),
      time_started: new Date(),
      time_completed: new Date(),
      data_file: 'example.dat',
      pdb_file: 'example.pdb',
      psf_file: 'example.psf',
      crd_file: 'example.crd',
      const_inp_file: 'const.inp',
      rg: 25,
      rg_min: 20,
      rg_max: 30,
      conformational_sampling: 1
    } as any,
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
        data: {
          type: 'pdb',
          title: 'test',
          uuid: '123'
        }
      }
    }
  }

  return {
    mongo: { ...baseJob.mongo, ...(overrides.mongo || {}) },
    bullmq: { ...baseJob.bullmq, ...(overrides.bullmq || {}) }
  } as BilboMDJob
}
