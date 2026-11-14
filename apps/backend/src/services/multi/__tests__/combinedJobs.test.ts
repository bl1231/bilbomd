import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IMultiJob } from '@bilbomd/mongodb-schema'

const { mockJobFind, mockReadFile } = vi.hoisted(() => ({
  mockJobFind: vi.fn(),
  mockReadFile: vi.fn()
}))

vi.mock('fs-extra', () => ({ default: { readFile: mockReadFile } }))
vi.mock('../../../config/config.js', () => ({ getEnvVar: () => '/data' }))
vi.mock('../../../middleware/loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))
vi.mock('@bilbomd/mongodb-schema', () => ({ Job: { find: mockJobFind } }))

import { buildCombinedJobs, countConformations } from '../combinedJobs.js'

const RUN_A = 'a97dbd4e-d97e-48d8-bc4e-6e045fefdf8c'
const RUN_B = 'd8f60793-84b8-47b7-bee2-490d250dcdcb'

const profile = (run: string, n: number) =>
  `/bilbomd/uploads/${run}/foxs/rg30/md_${n}.pdb.dat`

const OWNER = 'owner-id'

const multiJob = {
  uuid: 'multi-uuid',
  bilbomd_uuids: [RUN_A, RUN_B],
  // populated, as getJobById loads it
  user: { _id: OWNER, username: 'alice' }
} as unknown as IMultiJob

const findReturns = (docs: object[]) =>
  mockJobFind.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => docs }) })
  })

describe('countConformations', () => {
  it('counts the profiles under each run, ignoring blank lines', () => {
    const list = [
      profile(RUN_A, 1),
      profile(RUN_A, 2),
      profile(RUN_B, 1),
      '',
      '/bilbomd/uploads/someone-else/foxs/x.pdb.dat'
    ].join('\n')

    expect(countConformations(list, [RUN_A, RUN_B])).toEqual({
      [RUN_A]: 2,
      [RUN_B]: 1
    })
  })

  it('reports 0 for a run with no profiles', () => {
    expect(countConformations(profile(RUN_A, 1), [RUN_A, RUN_B])).toEqual({
      [RUN_A]: 1,
      [RUN_B]: 0
    })
  })
})

describe('buildCombinedJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('summarises each run in bilbomd_uuids order with its conformations', async () => {
    findReturns([
      {
        _id: { toString: () => 'id-b' },
        __t: 'BilboMdAuto',
        uuid: RUN_B,
        title: 'second',
        status: 'Completed',
        md_engine: 'OpenMM'
      },
      {
        _id: { toString: () => 'id-a' },
        __t: 'BilboMdPDB',
        uuid: RUN_A,
        title: 'first',
        status: 'Completed',
        md_engine: 'CHARMM'
      }
    ])
    mockReadFile.mockResolvedValue(
      [profile(RUN_A, 1), profile(RUN_B, 1), profile(RUN_B, 2)].join('\n')
    )

    expect(await buildCombinedJobs(multiJob)).toEqual([
      {
        uuid: RUN_A,
        id: 'id-a',
        title: 'first',
        jobType: 'pdb',
        status: 'Completed',
        md_engine: 'CHARMM',
        conformations: 1
      },
      {
        uuid: RUN_B,
        id: 'id-b',
        title: 'second',
        jobType: 'auto',
        status: 'Completed',
        md_engine: 'OpenMM',
        conformations: 2
      }
    ])
    expect(mockReadFile).toHaveBeenCalledWith(
      '/data/multi-uuid/multi_md_foxs_files.txt',
      'utf8'
    )
  })

  it("only looks up runs the Multi job's owner owns", async () => {
    findReturns([])
    mockReadFile.mockResolvedValue('')

    await buildCombinedJobs(multiJob)

    expect(mockJobFind).toHaveBeenCalledWith({
      uuid: { $in: [RUN_A, RUN_B] },
      'user._id': OWNER
    })
  })

  it("shows another user's run as its uuid and count only", async () => {
    // RUN_B belongs to someone else, so the owner-filtered lookup misses it
    findReturns([
      {
        _id: { toString: () => 'id-a' },
        __t: 'BilboMdPDB',
        uuid: RUN_A,
        title: 'mine',
        status: 'Completed'
      }
    ])
    mockReadFile.mockResolvedValue(
      [profile(RUN_A, 1), profile(RUN_B, 1)].join('\n')
    )

    const [, other] = await buildCombinedJobs(multiJob)

    expect(other).toEqual({ uuid: RUN_B, conformations: 1 })
  })

  it('looks up every run for an Admin or Manager', async () => {
    findReturns([])
    mockReadFile.mockResolvedValue('')

    await buildCombinedJobs(multiJob, { privileged: true })

    expect(mockJobFind).toHaveBeenCalledWith({ uuid: { $in: [RUN_A, RUN_B] } })
  })

  it('looks nothing up when the Multi job has no owner', async () => {
    mockReadFile.mockResolvedValue('')

    const runs = await buildCombinedJobs({
      ...multiJob,
      user: undefined
    } as unknown as IMultiJob)

    expect(mockJobFind).not.toHaveBeenCalled()
    expect(runs).toEqual([
      { uuid: RUN_A, conformations: 0 },
      { uuid: RUN_B, conformations: 0 }
    ])
  })

  it('keeps a deleted run as its uuid and leaves counts out before the list exists', async () => {
    findReturns([])
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' })
    )

    expect(await buildCombinedJobs(multiJob)).toEqual([
      { uuid: RUN_A },
      { uuid: RUN_B }
    ])
  })
})
