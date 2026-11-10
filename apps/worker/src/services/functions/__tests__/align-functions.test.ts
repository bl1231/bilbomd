import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'

const { cfg, runProcess } = vi.hoisted(() => ({
  cfg: {
    uploadDir: '',
    basePythonBin: '/custom/envs/base/bin/python',
    processTimeouts: { helperScriptMs: 1000 }
  },
  runProcess: vi.fn()
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../../config/config.js', () => ({ config: cfg }))
vi.mock('../../../helpers/runProcess.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../helpers/runProcess.js')>()
  return { ...actual, runProcess }
})

const {
  alignEnsembleMembers,
  alignedPath,
  findReferenceMember,
  describeReport
} = await import('../align-functions.js')
const { ProcessError } = await import('../../../helpers/runProcess.js')

let jobDir: string
const member = (rg: string, n: string) =>
  path.join(jobDir, 'foxs', rg, `bioemu_${rg}_${n}.pdb`)

const report = {
  method: 'rigid-domain' as const,
  samples: 299,
  residues: 524,
  anchor_size: 296,
  domains: [
    { id: 1, size: 296, residues: ['A:2-292'] },
    { id: 2, size: 123, residues: ['B:69-196'] }
  ],
  members: []
}

// Stands in for align_ensemble.py: writes each requested copy and the report
const fakeScript =
  (skip: string[] = []) =>
  async ({ args }: { args: string[] }) => {
    const request = (await fs.readJson(args[1])) as {
      members: { in: string; out: string }[]
    }
    for (const m of request.members) {
      if (!skip.includes(m.out)) await fs.outputFile(m.out, 'ALIGNED\n')
    }
    await fs.writeJson(args[2], report)
  }

beforeEach(async () => {
  cfg.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'align-'))
  jobDir = path.join(cfg.uploadDir, 'uuid-1')
  await fs.outputFile(
    path.join(jobDir, 'multifoxs', 'ensembles_size_1.txt'),
    `1 |  1.12 | x1 1.12 (1.05, -0.50)
    1   | 1.000 (1.000, 0.000) | ../foxs/rg38/bioemu_rg38_0012.pdb.dat (0.500)
`
  )
  vi.clearAllMocks()
})

afterEach(async () => {
  await fs.remove(cfg.uploadDir)
})

describe('alignedPath', () => {
  it('keeps the Rg directory in the name, so members stay unique', () => {
    expect(alignedPath(jobDir, member('rg30', '0001'))).toBe(
      path.join(jobDir, 'align', 'rg30_bioemu_rg30_0001.pdb')
    )
  })
})

describe('findReferenceMember', () => {
  const members = () => [member('rg30', '0001'), member('rg38', '0012')]

  it('is the best single-state model', async () => {
    expect(await findReferenceMember(jobDir, members())).toBe(
      member('rg38', '0012')
    )
  })

  it('falls back to the first member', async () => {
    await fs.remove(path.join(jobDir, 'multifoxs', 'ensembles_size_1.txt'))
    expect(await findReferenceMember(jobDir, members())).toBe(
      member('rg30', '0001')
    )
    // ...also when the single-state model is not among the members
    expect(await findReferenceMember(jobDir, [member('rg30', '0001')])).toBe(
      member('rg30', '0001')
    )
  })
})

describe('describeReport', () => {
  it('reports the anchor domain', () => {
    expect(describeReport(report)).toBe(
      'Members superposed on the largest rigid domain (296 of 524 residues; 2 rigid domains found in 299 sampled structures).'
    )
  })

  it('says so when it had to use all residues', () => {
    expect(
      describeReport({ ...report, method: 'all-residues', domains: [] })
    ).toMatch(/No rigid domain was found/)
  })
})

describe('alignEnsembleMembers', () => {
  it('superposes polished copies where they exist and records the result', async () => {
    runProcess.mockImplementation(fakeScript())
    const members = [member('rg30', '0001'), member('rg38', '0012')]
    const polished = {
      [member('rg38', '0012')]: path.join(jobDir, 'polish', 'p38.pdb')
    }

    const message = await alignEnsembleMembers(jobDir, members, polished)

    const [opts] = runProcess.mock.calls[0]
    expect(opts.cmd).toBe('/custom/envs/base/bin/python')
    expect(opts.args[0]).toMatch(/scripts\/align_ensemble\.py$/)
    expect(await fs.readJson(opts.args[1])).toEqual({
      samples_dir: path.join(jobDir, 'foxs'),
      members: [
        {
          in: member('rg30', '0001'),
          out: path.join(jobDir, 'align', 'rg30_bioemu_rg30_0001.pdb')
        },
        {
          in: path.join(jobDir, 'polish', 'p38.pdb'),
          out: path.join(jobDir, 'align', 'rg38_bioemu_rg38_0012.pdb')
        }
      ],
      // the best single-state model, as its polished copy
      reference: path.join(jobDir, 'polish', 'p38.pdb')
    })
    // keyed by the original member path, like polished.json
    expect(
      await fs.readJson(path.join(jobDir, 'align', 'aligned.json'))
    ).toEqual({
      [member('rg30', '0001')]: path.join(
        jobDir,
        'align',
        'rg30_bioemu_rg30_0001.pdb'
      ),
      [member('rg38', '0012')]: path.join(
        jobDir,
        'align',
        'rg38_bioemu_rg38_0012.pdb'
      )
    })
    expect(message).toMatch(/largest rigid domain \(296 of 524/)
  })

  it('records only the copies the script wrote', async () => {
    const missing = path.join(jobDir, 'align', 'rg30_bioemu_rg30_0001.pdb')
    runProcess.mockImplementation(fakeScript([missing]))

    await alignEnsembleMembers(
      jobDir,
      [member('rg30', '0001'), member('rg38', '0012')],
      {}
    )

    expect(
      Object.keys(await fs.readJson(path.join(jobDir, 'align', 'aligned.json')))
    ).toEqual([member('rg38', '0012')])
  })

  it('is not fatal, and leaves no map behind, when the script fails', async () => {
    await fs.outputJson(path.join(jobDir, 'align', 'aligned.json'), { a: 'b' })
    runProcess.mockRejectedValue(new Error('Align ensemble exited with code 1'))

    const message = await alignEnsembleMembers(
      jobDir,
      [member('rg30', '0001')],
      {}
    )

    expect(message).toMatch(/could not be superposed: Align ensemble exited/)
    expect(
      await fs.pathExists(path.join(jobDir, 'align', 'aligned.json'))
    ).toBe(false)
  })

  it('still lets a cancelled job stop', async () => {
    runProcess.mockRejectedValue(
      new ProcessError('Align ensemble', 'python', {
        code: null,
        signal: 'SIGTERM',
        timedOut: false,
        aborted: true,
        stderrTail: []
      })
    )
    await expect(
      alignEnsembleMembers(jobDir, [member('rg30', '0001')], {})
    ).rejects.toThrow(/cancelled/)
  })
})
