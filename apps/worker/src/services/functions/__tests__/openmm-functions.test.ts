import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runOmmMD, prepareOpenMMConfig } from '../openmm-functions.js'
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
    openmmMdConcurrency: 1,
    processTimeouts: {
      openmmSetupMs: 60 * 60 * 1000,
      openmmMdMs: 4 * 60 * 60 * 1000
    }
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
  let fs: {
    pathExists: ReturnType<typeof vi.fn>
    readFile: ReturnType<typeof vi.fn>
  }
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

  it('uses config.processTimeouts.openmmMdMs as the per-run timeout', async () => {
    setupRgs([25, 35])
    runPythonStep.mockResolvedValue({ code: 0, signal: null })

    await runOmmMD(makeMQJob(), makeDBJob(), { concurrency: 2 })

    const timeouts = runPythonStep.mock.calls.map((c) => c[2].timeoutMs)
    expect(timeouts).toEqual([4 * 60 * 60 * 1000, 4 * 60 * 60 * 1000])
  })

  it('lets opts.timeoutMs override the configured MD timeout', async () => {
    setupRgs([25])
    runPythonStep.mockResolvedValue({ code: 0, signal: null })

    await runOmmMD(makeMQJob(), makeDBJob(), { timeoutMs: 1234 })

    expect(runPythonStep.mock.calls[0][2].timeoutMs).toBe(1234)
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

describe('runOmmMD failure reporting', () => {
  let runPythonStep: ReturnType<typeof vi.fn>

  type StepOpts = {
    env: { OMM_RG: string }
    onStderrLine: (line: string) => void
  }

  const setupRgs = async (rgs: number[]) => {
    const fsMod = await import('fs-extra')
    vi.mocked(fsMod.default.readFile).mockResolvedValue('yaml-content' as never)
    const yamlMod = await import('yaml')
    vi.mocked(yamlMod.default.parse).mockReturnValue({
      steps: { md: { rgyr: { rgs } } }
    })
  }

  // Fail the given Rg targets; `unstable` ones print md.py's NaN marker first.
  const failRgs = (unstable: number[], plain: number[] = []) => {
    runPythonStep.mockImplementation(
      async (_script: string, _cfg: string, opts: StepOpts) => {
        const rg = Number(opts.env.OMM_RG)
        if (unstable.includes(rg)) {
          opts.onStderrLine(
            `ERROR: BILBOMD_MD_UNSTABLE: rg=${rg} simulation became numerically unstable (NaN coordinates): Particle coordinate is NaN.`
          )
          return { code: 1, signal: null }
        }
        if (plain.includes(rg)) {
          opts.onStderrLine('Traceback (most recent call last):')
          return { code: 1, signal: null }
        }
        return { code: 0, signal: null }
      }
    )
  }

  const runAndCatch = async (): Promise<string> => {
    try {
      await runOmmMD(makeMQJob(), makeDBJob(), { concurrency: 6 })
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    throw new Error('expected runOmmMD to reject')
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    delete process.env.CUDA_VISIBLE_DEVICES
    const runPythonMod = await import('../../../helpers/runPythonStep.js')
    runPythonStep = vi.mocked(runPythonMod.runPythonStep)
  })

  it('explains NaN blow-ups and names the unstable Rg targets and range', async () => {
    await setupRgs([10, 28, 46, 64, 82, 100])
    failRgs([100, 82])

    const message = await runAndCatch()

    expect(message).toBe(
      'OpenMM md failed: the simulation became unstable (NaN coordinates) at Rg 82, 100 Å (2 of 6 runs). ' +
        'This usually means the requested Rg range (10–100 Å) is too far from the size of the starting model. ' +
        'Try an Rg range closer to the experimental Rg.'
    )
    expect(message).not.toContain('exit 1')
  })

  it('still lists other failures alongside unstable ones', async () => {
    await setupRgs([20, 40, 60])
    failRgs([60], [20])

    const message = await runAndCatch()

    expect(message).toContain(
      'became unstable (NaN coordinates) at Rg 60 Å (1 of 3 runs)'
    )
    expect(message).toContain(
      'Other errors: rg=20: md.py (rg=20, GPU=0) failed (exit 1)'
    )
  })

  it('keeps the generic message when no run reported NaN', async () => {
    await setupRgs([20, 40])
    failRgs([], [40])

    const message = await runAndCatch()

    expect(message).toBe(
      'OpenMM md failed: 1/2 failures (50% > 0% threshold). Errors: rg=40: md.py (rg=40, GPU=0) failed (exit 1)'
    )
  })
})

describe('prepareOpenMMConfig rigid body overlaps', () => {
  const rigidBody = (
    name: string,
    chain_id: string,
    start: number,
    stop: number
  ) => ({
    name,
    segments: [{ chain_id, residues: { start, stop } }]
  })

  const makeConfigJob = () =>
    ({
      ...makeDBJob(),
      __t: 'BilboMdPDB',
      pdb_file: 'model.pdb'
    }) as unknown as IBilboMDPDBJob

  const loadConstraints = async (rigid_bodies: unknown[]) => {
    const fsMod = await import('fs-extra')
    const yamlMod = await import('yaml')
    vi.mocked(fsMod.default.pathExists).mockResolvedValue(true as never)
    vi.mocked(fsMod.default.readFile).mockResolvedValue('' as never)
    vi.mocked(fsMod.default.writeFile).mockClear()
    vi.mocked(yamlMod.default.parse).mockReturnValue({
      constraints: { fixed_bodies: [], rigid_bodies }
    })
    return fsMod.default
  }

  it('fails before writing the config when rigid bodies share residues', async () => {
    const fs = await loadConstraints([
      rigidBody('RigidBody1', 'C', 1, 26),
      rigidBody('RigidBody2', 'C', 1, 26)
    ])

    await expect(prepareOpenMMConfig(makeConfigJob())).rejects.toThrow(
      'Rigid bodies must not overlap: RigidBody1 and RigidBody2 both include chain C residues 1-26'
    )
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('writes the config when rigid bodies are disjoint', async () => {
    const fs = await loadConstraints([
      rigidBody('RigidBody1', 'A', 1, 238),
      rigidBody('RigidBody2', 'C', 1, 26)
    ])

    await expect(prepareOpenMMConfig(makeConfigJob())).resolves.toBeUndefined()
    expect(fs.writeFile).toHaveBeenCalled()
  })
})
