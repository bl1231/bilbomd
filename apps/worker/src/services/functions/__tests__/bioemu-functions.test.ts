import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import type { Job as BullMQJob } from 'bullmq'
import type { IBilboMDBioEmuJob } from '@bilbomd/mongodb-schema'

const { cfg, post, updateStepStatus, handleError } = vi.hoisted(() => ({
  cfg: {
    uploadDir: '',
    bioemuServiceUrl: 'http://bioemu2-service:8000',
    bioemuTimeoutMs: 1000
  },
  post: vi.fn(),
  updateStepStatus: vi.fn(),
  handleError: vi.fn()
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../mongo-utils.js', () => ({ updateStepStatus }))
vi.mock('../job-utils.js', () => ({ handleError }))
vi.mock('../../../config/config.js', () => ({ config: cfg }))
vi.mock('axios', () => ({
  default: {
    post,
    isAxiosError: (e: unknown) =>
      Boolean((e as { isAxiosError?: boolean })?.isAxiosError)
  }
}))

const {
  runBioEmu,
  writeBioEmuParams,
  clearPreviousOutputs,
  describeSummary,
  BIOEMU_SYSTEM_YAML,
  BIOEMU_PARAMS_JSON
} = await import('../bioemu-functions.js')

const params = {
  rgs: [30, 34, 38],
  num_samples_per_rg: 50,
  batch_size: 40,
  num_steps: 50,
  num_gd_steps: 5,
  rg_weight: 0.02,
  default_potentials: true
}

const summary = {
  total_frames: 150,
  total_physical: 147,
  seconds: 600,
  targets: { rg30: {}, rg34: {}, rg38: {} }
}

let uploadDir: string
let workDir: string

const makeJob = (over: Partial<IBilboMDBioEmuJob> = {}) =>
  ({
    uuid: 'uuid-1',
    bioemu_parameters: params,
    ...over
  }) as unknown as IBilboMDBioEmuJob

const mq = {
  log: vi.fn(),
  updateProgress: vi.fn()
} as unknown as BullMQJob

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bioemu-'))
  cfg.uploadDir = uploadDir
  workDir = path.join(uploadDir, 'uuid-1')
  await fs.ensureDir(path.join(workDir, 'bioemu'))
  vi.clearAllMocks()
})

afterEach(async () => {
  await fs.remove(uploadDir)
})

describe('writeBioEmuParams', () => {
  it('writes the stored settings for the service, with a fixed seed', async () => {
    await writeBioEmuParams(workDir, makeJob())
    expect(await fs.readJson(path.join(workDir, BIOEMU_PARAMS_JSON))).toEqual({
      ...params,
      seed: 0
    })
  })

  it('rejects a job without Rg targets', async () => {
    await expect(
      writeBioEmuParams(
        workDir,
        makeJob({ bioemu_parameters: { ...params, rgs: [] } })
      )
    ).rejects.toThrow(/no Rg targets/)
  })
})

describe('clearPreviousOutputs', () => {
  it('removes earlier BioEmu2 samples but leaves other foxs/ content', async () => {
    const foxs = path.join(workDir, 'foxs')
    await fs.outputFile(path.join(foxs, 'rg30', 'old.pdb'), 'x')
    await fs.outputFile(path.join(foxs, 'rg30.5', 'old.pdb'), 'x')
    await fs.outputFile(path.join(foxs, 'keep', 'other.pdb'), 'x')
    await fs.outputFile(path.join(workDir, 'bioemu', 'progress.json'), '{}')

    await clearPreviousOutputs(workDir)

    expect(await fs.pathExists(path.join(foxs, 'rg30'))).toBe(false)
    expect(await fs.pathExists(path.join(foxs, 'rg30.5'))).toBe(false)
    expect(await fs.pathExists(path.join(foxs, 'keep', 'other.pdb'))).toBe(true)
    expect(
      await fs.pathExists(path.join(workDir, 'bioemu', 'progress.json'))
    ).toBe(false)
  })

  it('copes with a job that has no foxs/ yet', async () => {
    await expect(clearPreviousOutputs(workDir)).resolves.toBeUndefined()
  })
})

describe('describeSummary', () => {
  it('reports physical structures, targets and minutes', () => {
    expect(describeSummary(summary)).toBe(
      'BioEmu2 sampling has completed: 147 of 150 structures passed the physicality check (3 Rg targets, 10 min).'
    )
  })
})

describe('runBioEmu', () => {
  it('fails clearly when the backend did not write system.yaml', async () => {
    await expect(runBioEmu(mq, makeJob())).rejects.toThrow(
      /system.yaml missing/
    )
    expect(post).not.toHaveBeenCalled()
    expect(handleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.anything(),
      'bioemu'
    )
  })

  it('calls the service and records the summary on the step', async () => {
    await fs.outputFile(
      path.join(workDir, BIOEMU_SYSTEM_YAML),
      'entities: []\n'
    )
    post.mockResolvedValue({ data: { status: 'ok', summary } })

    await runBioEmu(mq, makeJob())

    expect(post).toHaveBeenCalledWith(
      'http://bioemu2-service:8000/infer',
      { uuid: 'uuid-1' },
      expect.objectContaining({ timeout: 1000 })
    )
    expect(await fs.pathExists(path.join(workDir, BIOEMU_PARAMS_JSON))).toBe(
      true
    )
    expect(updateStepStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      'bioemu',
      expect.objectContaining({
        status: 'Success',
        message: expect.stringContaining('147 of 150')
      })
    )
  })

  it("surfaces the service's error detail", async () => {
    await fs.outputFile(
      path.join(workDir, BIOEMU_SYSTEM_YAML),
      'entities: []\n'
    )
    post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: { detail: 'only 3 of 300 BioEmu2 structures passed' }
      }
    })

    await expect(runBioEmu(mq, makeJob())).rejects.toThrow(
      'BioEmu2 service returned HTTP 422: only 3 of 300 BioEmu2 structures passed'
    )
    expect(handleError).toHaveBeenCalled()
  })
})
