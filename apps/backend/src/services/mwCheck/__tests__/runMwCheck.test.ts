import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile }))

const { runMwCheck } = await import('../runMwCheck.js')

type Callback = (
  error: Error | null,
  result?: { stdout: string; stderr: string }
) => void

// promisify(execFile) calls the mock with a trailing callback
const scriptPrints = (stdout: string) =>
  execFile.mockImplementation((...args: unknown[]) => {
    ;(args.at(-1) as Callback)(null, { stdout, stderr: '' })
  })

const result = {
  mw: { model_kda: 28.9, saxs_kda: 29.1 },
  finding: { code: 'mw_consistent', severity: 'good', title: 't', detail: 'd' }
}

beforeEach(() => {
  execFile.mockReset()
})

describe('runMwCheck', () => {
  it.each([
    ['pdb', 'model.pdb'],
    ['psf', 'model.psf'],
    ['entities', 'entities.json']
  ] as const)('runs the script on a %s model', async (kind, file) => {
    scriptPrints(JSON.stringify(result) + '\n')

    await expect(
      runMwCheck('/data/mwcheck_uploads/abc', 'expdata.dat', { kind, file })
    ).resolves.toEqual(result)

    const [command, args, options] = execFile.mock.calls[0]!
    expect(command).toBe('python')
    expect(args).toEqual([
      '/app/scripts/mw_check.py',
      'expdata.dat',
      `--${kind}`,
      file
    ])
    expect(options).toMatchObject({
      cwd: '/data/mwcheck_uploads/abc',
      timeout: 60_000
    })
  })

  it('rejects when the script fails or times out', async () => {
    execFile.mockImplementation((...args: unknown[]) => {
      ;(args.at(-1) as Callback)(new Error('Command failed: python'))
    })
    await expect(
      runMwCheck('/d', 'expdata.dat', { kind: 'pdb', file: 'model.pdb' })
    ).rejects.toThrow('Command failed')
  })

  it.each([
    ['not JSON', 'Traceback (most recent call last):'],
    ['JSON of another shape', '{"rg": 27.2}']
  ])('rejects output that is %s', async (_name, stdout) => {
    scriptPrints(stdout)
    await expect(
      runMwCheck('/d', 'expdata.dat', { kind: 'pdb', file: 'model.pdb' })
    ).rejects.toThrow()
  })
})
