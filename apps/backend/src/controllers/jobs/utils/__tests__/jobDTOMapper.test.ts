import { describe, it, expect } from 'vitest'
import {
  mapDiscriminatorToJobType,
  mapStatus,
  mapUserToSummary,
  mapJobMongoToDTO,
  mapMultiJobMongoToDTO,
  buildBilboMDJobDTO,
  buildMultiJobDTO
} from '../jobDTOMapper.js'
import type {
  IBilboMDSANSJob,
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDScoperJob,
  IUser,
  IJob,
  IMultiJob
} from '@bilbomd/mongodb-schema'
import type { BilboMDSANSDTO } from '@bilbomd/bilbomd-types'

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    title: 'Test Job',
    uuid: 'uuid-123',
    access_mode: 'private' as unknown as IJob['access_mode'],
    public_id: 'pub-1',
    status: 'Pending',
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

// ─── mapDiscriminatorToJobType ───────────────────────────────────────────────

describe('mapDiscriminatorToJobType', () => {
  it.each([
    ['BilboMdPDB', 'pdb'],
    ['BilboMdCRD', 'crd'],
    ['BilboMdAuto', 'auto'],
    ['BilboMdAlphaFold', 'alphafold'],
    ['BilboMdSANS', 'sans'],
    ['BilboMdScoper', 'scoper'],
    ['MultiJob', 'multi']
  ])('maps %s → %s', (discriminator, expected) => {
    expect(mapDiscriminatorToJobType(discriminator)).toBe(expected)
  })

  it('returns multi for unknown discriminator', () => {
    expect(mapDiscriminatorToJobType('UnknownType')).toBe('multi')
  })

  it('returns multi when discriminator is undefined', () => {
    expect(mapDiscriminatorToJobType(undefined)).toBe('multi')
  })
})

// ─── mapStatus ──────────────────────────────────────────────────────────────

describe('mapStatus', () => {
  it('passes status through unchanged', () => {
    expect(mapStatus('Completed')).toBe('Completed')
    expect(mapStatus('Running')).toBe('Running')
  })
})

// ─── mapUserToSummary ────────────────────────────────────────────────────────

describe('mapUserToSummary', () => {
  it('maps a valid user to a summary', () => {
    const user = makeUser()
    expect(mapUserToSummary(user)).toEqual({
      id: 'user-id',
      username: 'alice',
      email: 'alice@example.com'
    })
  })

  it('returns undefined for null', () => {
    expect(mapUserToSummary(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(mapUserToSummary(undefined)).toBeUndefined()
  })

  it('returns undefined when user has no _id', () => {
    const user = { username: 'bob', email: 'bob@example.com' } as IUser
    expect(mapUserToSummary(user)).toBeUndefined()
  })
})

// ─── mapJobMongoToDTO – per job type ────────────────────────────────────────

describe('mapJobMongoToDTO - pdb', () => {
  it('maps all pdb-specific fields', () => {
    const job: IBilboMDPDBJob = {
      ...baseJob({ __t: 'BilboMdPDB' }),
      pdb_file: 'mol.pdb',
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      const_inp_file: 'const.inp',
      rg: 25,
      rg_min: 15,
      rg_max: 35,
      conformational_sampling: 3
    } as IBilboMDPDBJob

    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('pdb')
    expect(dto).toMatchObject({
      pdb_file: 'mol.pdb',
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      const_inp_file: 'const.inp',
      rg: 25,
      rg_min: 15,
      rg_max: 35,
      conformational_sampling: 3
    })
  })
})

describe('mapJobMongoToDTO - crd', () => {
  it('maps all crd-specific fields', () => {
    const job: IBilboMDCRDJob = {
      ...baseJob({ __t: 'BilboMdCRD' }),
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      const_inp_file: 'const.inp',
      rg: 22,
      rg_min: 12,
      rg_max: 32,
      conformational_sampling: 2
    } as IBilboMDCRDJob

    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('crd')
    expect(dto).toMatchObject({
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      rg: 22
    })
  })
})

describe('mapJobMongoToDTO - auto', () => {
  it('maps all auto-specific fields', () => {
    const job: IBilboMDAutoJob = {
      ...baseJob({ __t: 'BilboMdAuto' }),
      pdb_file: 'mol.pdb',
      pae_file: 'mol.json',
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      const_inp_file: 'const.inp',
      rg: 28,
      rg_min: 18,
      rg_max: 38,
      conformational_sampling: 4
    } as IBilboMDAutoJob

    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('auto')
    expect(dto).toMatchObject({
      pdb_file: 'mol.pdb',
      pae_file: 'mol.json',
      rg: 28
    })
  })
})

describe('mapJobMongoToDTO - alphafold', () => {
  it('maps all alphafold-specific fields', () => {
    const job: IBilboMDAlphaFoldJob = {
      ...baseJob({ __t: 'BilboMdAlphaFold' }),
      alphafold_entities: [{ name: 'chainA', sequence: 'MKTL', type: 'protein', copies: 1 }],
      fasta_file: 'mol.fasta',
      pdb_file: 'mol.pdb',
      psf_file: 'mol.psf',
      crd_file: 'mol.crd',
      pae_file: 'mol.json',
      conformational_sampling: 2,
      rg: 20,
      rg_min: 10,
      rg_max: 30
    } as IBilboMDAlphaFoldJob

    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('alphafold')
    expect(dto).toMatchObject({
      fasta_file: 'mol.fasta',
      pae_file: 'mol.json',
      alphafold_entities: [{ name: 'chainA', sequence: 'MKTL', type: 'protein', copies: 1 }]
    })
  })
})

describe('mapJobMongoToDTO - scoper', () => {
  it('maps all scoper-specific fields', () => {
    const job: IBilboMDScoperJob = {
      ...baseJob({ __t: 'BilboMdScoper' }),
      pdb_file: 'mol.pdb',
      fixc1c2: true,
      foxs_top_file: 'top.dat'
    } as IBilboMDScoperJob

    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('scoper')
    expect(dto).toMatchObject({
      pdb_file: 'mol.pdb',
      fixc1c2: true,
      foxs_top_file: 'top.dat'
    })
  })
})

describe('mapJobMongoToDTO - multi (default)', () => {
  it('returns base shape for unknown __t', () => {
    const job = baseJob({ __t: 'BilboMd' as IJob['__t'] })
    const dto = mapJobMongoToDTO(job)
    expect(dto.jobType).toBe('multi')
    expect(dto.id).toBe('job-id')
  })
})

// ─── mapJobMongoToDTO – SANS deuteration_fractions branches ─────────────────

describe('mapJobMongoToDTO - SANS deuteration_fractions', () => {
  it('maps from Map', () => {
    const dto = mapJobMongoToDTO(baseSans())
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{ label: string; fraction: number }>
    expect(df).toEqual([
      { label: 'chainA', fraction: 0.5 },
      { label: 'chainB', fraction: 0.2 }
    ])
  })

  it('maps from plain object', () => {
    const job = baseSans({
      deuteration_fractions: { chainA: 0.8, chainC: 0.1 } as unknown as IBilboMDSANSJob['deuteration_fractions']
    })
    const dto = mapJobMongoToDTO(job)
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{ label: string; fraction: number }>
    const byLabel = Object.fromEntries(df.map((x) => [x.label, x.fraction]))
    expect(byLabel['chainA']).toBe(0.8)
    expect(byLabel['chainC']).toBe(0.1)
  })

  it('maps from Array', () => {
    const job = baseSans({
      deuteration_fractions: [
        { label: 'chainA', fraction: 0.3 },
        { label: 'chainB', fraction: 0.6 }
      ] as unknown as IBilboMDSANSJob['deuteration_fractions']
    })
    const dto = mapJobMongoToDTO(job)
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{ label: string; fraction: number }>
    expect(df).toEqual([
      { label: 'chainA', fraction: 0.3 },
      { label: 'chainB', fraction: 0.6 }
    ])
  })

  it('filters out invalid array entries', () => {
    const job = baseSans({
      deuteration_fractions: [
        { label: 'chainA', fraction: 0.3 },
        null,
        undefined,
        'bad'
      ] as unknown as IBilboMDSANSJob['deuteration_fractions']
    })
    const dto = mapJobMongoToDTO(job)
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{ label: string; fraction: number }>
    expect(df).toEqual([{ label: 'chainA', fraction: 0.3 }])
  })

  it('returns empty array when deuteration_fractions is undefined', () => {
    const job = baseSans({
      deuteration_fractions: undefined as unknown as IBilboMDSANSJob['deuteration_fractions']
    })
    const dto = mapJobMongoToDTO(job)
    const df = (dto as BilboMDSANSDTO)
      .deuteration_fractions as unknown as Array<{ label: string; fraction: number }>
    expect(df).toEqual([])
  })
})

// ─── mapMultiJobMongoToDTO ───────────────────────────────────────────────────

describe('mapMultiJobMongoToDTO', () => {
  const makeMultiJob = (overrides: Partial<IMultiJob> = {}): IMultiJob =>
    ({
      _id: { toString: () => 'multi-id' },
      __t: 'MultiJob',
      title: 'Multi Job',
      uuid: 'uuid-multi',
      bilbomd_uuids: ['uuid-a', 'uuid-b'],
      data_file_from: 'uuid-a',
      status: 'Pending',
      time_submitted: new Date('2024-06-01'),
      progress: 42,
      steps: [],
      nersc: undefined,
      user: makeUser(),
      ...overrides
    }) as IMultiJob

  it('maps all fields correctly', () => {
    const raw = mapMultiJobMongoToDTO(makeMultiJob()) as unknown as Record<string, unknown>
    expect(raw['jobType']).toBe('multi')
    expect(raw['id']).toBe('multi-id')
    expect(raw['title']).toBe('Multi Job')
    expect(raw['uuid']).toBe('uuid-multi')
    expect(raw['bilbomd_uuids']).toEqual(['uuid-a', 'uuid-b'])
    expect(raw['data_file_from']).toBe('uuid-a')
    expect(raw['progress']).toBe(42)
  })

  it('defaults progress to 0 when undefined', () => {
    const dto = mapMultiJobMongoToDTO(makeMultiJob({ progress: undefined as unknown as number }))
    expect(dto.progress).toBe(0)
  })

  it('maps time_started and time_completed as undefined when absent', () => {
    const dto = mapMultiJobMongoToDTO(makeMultiJob())
    expect(dto.time_started).toBeUndefined()
    expect(dto.time_completed).toBeUndefined()
  })

  it('maps time_started and time_completed when present', () => {
    const started = new Date('2024-06-02')
    const completed = new Date('2024-06-03')
    const dto = mapMultiJobMongoToDTO(
      makeMultiJob({ time_started: started, time_completed: completed })
    )
    expect(dto.time_started).toBe(started)
    expect(dto.time_completed).toBe(completed)
  })
})

// ─── buildBilboMDJobDTO ──────────────────────────────────────────────────────

describe('buildBilboMDJobDTO', () => {
  it('uses username from mongo user when not explicitly provided', () => {
    const dto = buildBilboMDJobDTO({ jobId: 'job-id', mongo: baseSans(), username: undefined })
    expect(dto.username).toBe('alice')
    expect(dto.mongo.user?.username).toBe('alice')
    expect(dto.mongo.id).toBe('job-id')
  })

  it('uses explicitly provided username over user summary', () => {
    const dto = buildBilboMDJobDTO({ jobId: 'job-id', mongo: baseSans(), username: 'bob' })
    expect(dto.username).toBe('bob')
  })

  it('falls back to "unknown" when user has no _id and no username provided', () => {
    const job = baseSans({ user: { username: 'ghost', email: 'ghost@example.com' } as IUser })
    const dto = buildBilboMDJobDTO({ jobId: 'job-id', mongo: job, username: undefined })
    expect(dto.username).toBe('unknown')
    expect(dto.mongo.user).toBeUndefined()
  })
})

// ─── buildMultiJobDTO ────────────────────────────────────────────────────────

describe('buildMultiJobDTO', () => {
  const makeMultiJob = (overrides: Partial<IMultiJob> = {}): IMultiJob =>
    ({
      _id: { toString: () => 'multi-id' },
      __t: 'MultiJob',
      title: 'Multi Job',
      uuid: 'uuid-multi',
      bilbomd_uuids: ['uuid-a'],
      data_file_from: 'uuid-a',
      status: 'Pending',
      time_submitted: new Date('2024-06-01'),
      progress: 10,
      steps: [],
      nersc: undefined,
      user: makeUser(),
      ...overrides
    }) as IMultiJob

  it('builds DTO with user summary from mongo user', () => {
    const dto = buildMultiJobDTO({ jobId: 'multi-id', mongo: makeMultiJob(), username: undefined })
    expect(dto.id).toBe('multi-id')
    expect(dto.username).toBe('alice')
    expect(dto.mongo.user?.username).toBe('alice')
  })

  it('uses explicitly provided username', () => {
    const dto = buildMultiJobDTO({ jobId: 'multi-id', mongo: makeMultiJob(), username: 'carol' })
    expect(dto.username).toBe('carol')
  })

  it('falls back to "unknown" when user has no _id', () => {
    const job = makeMultiJob({ user: { username: 'ghost' } as IUser })
    const dto = buildMultiJobDTO({ jobId: 'multi-id', mongo: job, username: undefined })
    expect(dto.username).toBe('unknown')
  })
})
