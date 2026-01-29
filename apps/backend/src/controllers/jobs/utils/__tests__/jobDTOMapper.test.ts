import { describe, it, expect } from 'vitest'
import { buildBilboMDJobDTO, mapJobMongoToDTO } from '../jobDTOMapper.js'
import type { IBilboMDSANSJob, IUser, IJob } from '@bilbomd/mongodb-schema'
import type { BilboMDSANSDTO } from '@bilbomd/bilbomd-types'

const makeUser = (overrides: Partial<IUser> = {}): IUser =>
  ({
    _id: { toString: () => 'user-id' },
    username: 'alice',
    email: 'alice@example.com',
    roles: [],
    ...overrides
  }) as IUser

const baseJob = (overrides: Partial<IJob> = {}): IJob =>
  ({
    _id: { toString: () => 'job-id' },
    __t: 'BilboMdSANS',
    title: 'SANS Job',
    uuid: 'uuid-123',
    access_mode: 'private' as unknown as IJob['access_mode'],
    public_id: 'pub-1',
    status: 'queued',
    time_submitted: new Date('2024-01-01'),
    progress: 0,
    cleanup_in_progress: false,
    md_engine: 'openmm' as unknown as IJob['md_engine'],
    openmm_parameters: undefined,
    charmm_parameters: undefined,
    md_constraints: undefined,
    steps: [],
    feedback: undefined,
    assets: [],
    nersc: undefined,
    data_file: undefined,
    results: undefined,
    user: makeUser(),
    ...overrides
  }) as IJob

const baseSans = (overrides: Partial<IBilboMDSANSJob> = {}): IBilboMDSANSJob =>
  ({
    ...(baseJob({ __t: 'BilboMdSANS' }) as IBilboMDSANSJob),
    pdb_file: 'model.pdb',
    psf_file: 'model.psf',
    crd_file: 'model.crd',
    const_inp_file: 'const.inp',
    rg: 30,
    rg_min: 20,
    rg_max: 40,
    d2o_fraction: 0.7,
    conformational_sampling: true,
    deuteration_fractions: new Map<string, number>([
      ['chainA', 0.5],
      ['chainB', 0.2]
    ]),
    ...overrides
  }) as IBilboMDSANSJob

describe('jobDTOMapper - SANS', () => {
  it('maps deuteration_fractions from Map to array', () => {
    const job = baseSans()
    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('sans')
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{
      label: string
      fraction: number
    }>
    expect(df).toEqual([
      { label: 'chainA', fraction: 0.5 },
      { label: 'chainB', fraction: 0.2 }
    ])
  })

  it('maps deuteration_fractions from plain object to array', () => {
    const job = baseSans({
      deuteration_fractions: {
        chainA: 0.8,
        chainC: 0.1
      } as unknown as IBilboMDSANSJob['deuteration_fractions']
    })
    const dto = mapJobMongoToDTO(job)
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{
      label: string
      fraction: number
    }>
    // Order may differ; compare as set-like
    expect(df.length).toBe(2)
    const byLabel = Object.fromEntries(df.map((x) => [x.label, x.fraction]))
    expect(byLabel['chainA']).toBe(0.8)
    expect(byLabel['chainC']).toBe(0.1)
  })
})

describe('buildBilboMDJobDTO - user summary', () => {
  it('includes username from mongo user when provided', () => {
    const job = baseSans()
    const dto = buildBilboMDJobDTO({
      jobId: 'job-id',
      mongo: job,
      username: undefined
    })
    expect(dto.username).toBe('alice')
    expect(dto.mongo.user?.username).toBe('alice')
    expect(dto.mongo.id).toBe('job-id')
  })

  it('uses provided username when given', () => {
    const job = baseSans()
    const dto = buildBilboMDJobDTO({
      jobId: 'job-id',
      mongo: job,
      username: 'bob'
    })
    expect(dto.username).toBe('bob')
  })
})
