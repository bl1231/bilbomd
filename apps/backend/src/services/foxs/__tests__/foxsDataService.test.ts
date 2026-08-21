import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildBilboFoxsData, buildScoperFoxsData } from '../foxsDataService.js'

vi.mock('fs-extra')
vi.mock('../foxsParser.js')
vi.mock('../guinierService.js', () => ({
  getGuinierFit: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../../config/config.js', () => ({
  getEnvVar: () => '/data'
}))
vi.mock('../../../middleware/loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

const makeDatContent = () => '# header\n# Chi^2 = 1.23\n0.001 100 99 2\n'

describe('buildBilboFoxsData', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const makeJob = (overrides = {}) =>
    ({
      uuid: 'test-uuid',
      data_file: 'experiment.dat',
      ...overrides
    }) as never

  it('returns 404 error when results directory does not exist', async () => {
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await expect(buildBilboFoxsData(makeJob())).rejects.toMatchObject({
      status: 404,
      message: 'results directory unavailable.'
    })
  })

  it('places base dat file at index 0 and ensemble files after', async () => {
    const { default: fs } = await import('fs-extra')
    const parser = await import('../foxsParser.js')

    vi.mocked(fs.existsSync).mockReturnValue(true)
    // Base dat found at first path attempt
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined) // minimization_output dat found
      .mockResolvedValueOnce(undefined) // log file access in createDataObject
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(makeDatContent() as never) // base dat read
      .mockResolvedValueOnce('c1 = 1.05 c2 = 0.02' as never) // log file read
    vi.mocked(fs.readdir).mockResolvedValue([
      'multi_state_model_1_1_1.dat',
      'multi_state_model_2_1_1.dat'
    ] as never)

    // Ensemble reads: each calls access + readFile(dat) + readFile(log)
    vi.mocked(fs.access)
      .mockResolvedValue(undefined) // access always succeeds from here on

    vi.mocked(parser.parseFileContent).mockReturnValue([
      { q: 0.001, exp_intensity: 100, model_intensity: 99, error: 2 }
    ])
    vi.mocked(parser.extractChiSquared).mockReturnValue(1.23)
    vi.mocked(parser.extractC1C2).mockResolvedValue({ c1: '1.05', c2: '0.02' })

    const result = await buildBilboFoxsData(makeJob())
    expect(result[0].filename).toMatch(/minimization_output_experiment/)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('attaches the Guinier fit to the base dataset when available', async () => {
    const { default: fs } = await import('fs-extra')
    const parser = await import('../foxsParser.js')
    const guinierService = await import('../guinierService.js')

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.access).mockResolvedValue(undefined)
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(makeDatContent() as never)
      .mockResolvedValue('c1 = 1.05 c2 = 0.02' as never)
    vi.mocked(fs.readdir).mockResolvedValue([] as never)

    vi.mocked(parser.parseFileContent).mockReturnValue([
      { q: 0.001, exp_intensity: 100, model_intensity: 99, error: 2 }
    ])
    vi.mocked(parser.extractChiSquared).mockReturnValue(1.23)
    vi.mocked(parser.extractC1C2).mockResolvedValue({ c1: '1.05', c2: '0.02' })

    const fit = { rg: 40.4, i0: 1234.5, qmin: 0.012, qmax: 0.032, r2: 0.99 }
    vi.mocked(guinierService.getGuinierFit).mockResolvedValue(fit)

    const result = await buildBilboFoxsData(makeJob())

    expect(guinierService.getGuinierFit).toHaveBeenCalledWith(
      '/data/test-uuid',
      'experiment.dat'
    )
    expect(result[0].guinier).toEqual(fit)
  })

  it('throws FOXS_DATA_UNAVAILABLE when no dat and no ensembles', async () => {
    const { default: fs } = await import('fs-extra')

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(fs.readdir).mockResolvedValue([] as never)

    await expect(buildBilboFoxsData(makeJob())).rejects.toMatchObject({
      status: 404,
      code: 'FOXS_DATA_UNAVAILABLE'
    })
  })
})

describe('buildScoperFoxsData', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const makeScoperJob = () =>
    ({
      uuid: 'scoper-uuid',
      data_file: 'experiment.dat',
      pdb_file: 'original.pdb'
    }) as never

  it('throws 404 when foxs_analysis directory missing', async () => {
    const { default: fs } = await import('fs-extra')
    const parser = await import('../foxsParser.js')

    vi.mocked(parser.readTopKNum).mockResolvedValue(3)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await expect(buildScoperFoxsData(makeScoperJob())).rejects.toMatchObject({
      status: 404,
      message: 'FoXS analysis data not found.'
    })
  })

  it('returns array with two entries: original and scoper', async () => {
    const { default: fs } = await import('fs-extra')
    const parser = await import('../foxsParser.js')

    vi.mocked(parser.readTopKNum).mockResolvedValue(3)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(makeDatContent() as never)
    vi.mocked(parser.parseFileContent).mockReturnValue([
      { q: 0.001, exp_intensity: 100, model_intensity: 99, error: 2 }
    ])
    vi.mocked(parser.extractChiSquared).mockReturnValue(1.23)
    vi.mocked(parser.extractScoperC1C2).mockReturnValue({
      c1FromOrig: 1.05,
      c1FromScop: 1.02,
      c2FromOrig: 0.02,
      c2FromScop: -0.05
    })

    const result = await buildScoperFoxsData(makeScoperJob())
    expect(result).toHaveLength(2)
    expect(result[0].filename).toBe('original.pdb')
    expect(result[1].filename).toBe('scoper_combined_newpdb_3.pdb')
    expect(result[0].c1).toBe('1.05')
    expect(result[1].c1).toBe('1.02')
  })
})
