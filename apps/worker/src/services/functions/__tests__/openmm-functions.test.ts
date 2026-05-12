import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runOmmMD } from '../openmm-functions.js'
import { Job as BullMQJob } from 'bullmq'
import type { IBilboMDPDBJob } from '@bilbomd/mongodb-schema'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../job-utils.js', () => ({
  handleError: vi.fn().mockResolvedValue(undefined),
  makeDir: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    uploadDir: '/uploads',
    openmmPythonBin: '/opt/envs/openmm/bin/python',
    openmmMdConcurrency: 1
  }
}))

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('yaml', () => ({
  default: {
    parse: vi.fn(),
    stringify: vi.fn().mockReturnValue('')
  }
}))

vi.mock('../../../helpers/runPythonStep.js', () => ({
  runPythonStep: vi.fn()
}))

const makeDBJob = (uuid = 'test-uuid'): IBilboMDPDBJob =>
  ({
    uuid,
    _id: 'job-id',
    steps: {
      md: { status: 'Waiting', message: '' }
    },
    save: vi.fn().mockResolvedValue(undefined)
  }) as unknown as IBilboMDPDBJob

const makeMQJob = (): BullMQJob => ({}) as BullMQJob

describe('runOmmMD concurrency', () => {
  let runPythonStep: ReturnType<typeof vi.fn>
  let fs: { pathExists: ReturnType<typeof vi.fn>; readFile: ReturnType<typeof vi.fn> }
  let YAML: { parse: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    delete process.env.CUDA_VISIBLE_DEVICES

    const runPythonMod = await import('../../../helpers/runPythonStep.js')
    runPythonStep = vi.mocked(runPythonMod.runPythonStep)

    const fsMod = await import('fs-extra')
    fs = vi.mocked(fsMod.default) as typeof fs

    const yamlMod = await import('yaml')
    YAML = vi.mocked(yamlMod.default) as typeof YAML
  })

  const setupRgs = (rgs: number[]) => {
    fs.readFile.mockResolvedValue('yaml-content')
    YAML.parse.mockReturnValue({ steps: { md: { rgyr: { rgs } } } })
  }

  it('runs serially by default (concurrency=1)', async () => {
    const rgs = [20, 30, 40]
    setupRgs(rgs)

    let maxConcurrent = 0
    let currentConcurrent = 0
    runPythonStep.mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 5))
      currentConcurrent--
      return { code: 0, signal: null }
    })

    await runOmmMD(makeMQJob(), makeDBJob())

    expect(runPythonStep).toHaveBeenCalledTimes(3)
    expect(maxConcurrent).toBe(1)
  })

  it('runs N concurrent processes when opts.concurrency=N', async () => {
    const rgs = [20, 30, 40, 50, 55]
    setupRgs(rgs)

    let maxConcurrent = 0
    let currentConcurrent = 0
    runPythonStep.mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 20))
      currentConcurrent--
      return { code: 0, signal: null }
    })

    await runOmmMD(makeMQJob(), makeDBJob(), { concurrency: 3 })

    expect(runPythonStep).toHaveBeenCalledTimes(5)
    expect(maxConcurrent).toBe(3)
  })

  it('caps concurrency at rgs.length when concurrency exceeds it', async () => {
    const rgs = [20, 30, 40]
    setupRgs(rgs)

    let maxConcurrent = 0
    let currentConcurrent = 0
    runPythonStep.mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 10))
      currentConcurrent--
      return { code: 0, signal: null }
    })

    await runOmmMD(makeMQJob(), makeDBJob(), { concurrency: 10 })

    expect(runPythonStep).toHaveBeenCalledTimes(3)
    expect(maxConcurrent).toBe(3)
  })

  it('passes OMM_RG env var for each Rg value', async () => {
    const rgs = [25, 35]
    setupRgs(rgs)
    runPythonStep.mockResolvedValue({ code: 0, signal: null })

    await runOmmMD(makeMQJob(), makeDBJob(), { concurrency: 2 })

    const calls = runPythonStep.mock.calls
    const passedRgs = calls.map((c) => c[2].env.OMM_RG)
    expect(passedRgs).toContain('25')
    expect(passedRgs).toContain('35')
  })

  it('uses config.openmmMdConcurrency as default when opts.concurrency is not passed', async () => {
    const configMod = await import('../../../config/config.js')
    vi.mocked(configMod).config.openmmMdConcurrency = 2

    const rgs = [20, 30, 40]
    setupRgs(rgs)

    let maxConcurrent = 0
    let currentConcurrent = 0
    runPythonStep.mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 15))
      currentConcurrent--
      return { code: 0, signal: null }
    })

    await runOmmMD(makeMQJob(), makeDBJob())

    expect(maxConcurrent).toBe(2)

    vi.mocked(configMod).config.openmmMdConcurrency = 1
  })
})
