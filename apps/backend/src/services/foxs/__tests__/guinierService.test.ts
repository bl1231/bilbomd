import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGuinierFit, toGuinierFit } from '../guinierService.js'

vi.mock('fs-extra')
vi.mock('../../../middleware/loggers.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../../controllers/jobs/utils/autoRg.js', () => ({
  spawnAutoRgCalculator: vi.fn()
}))

const freshAutoRgResults = {
  rg: 40,
  rg_min: 36,
  rg_max: 60,
  qmin: 0.012,
  qmax: 0.032,
  rg_exact: 40.4,
  i0: 1234.5,
  r2: 0.99,
  qrg_min: 0.48,
  qrg_max: 1.29
}

describe('toGuinierFit', () => {
  it('maps AutoRg results to a GuinierFit using the unrounded Rg', () => {
    expect(toGuinierFit(freshAutoRgResults)).toEqual({
      rg: 40.4,
      i0: 1234.5,
      qmin: 0.012,
      qmax: 0.032,
      r2: 0.99
    })
  })

  it('falls back to rounded rg when rg_exact is absent', () => {
    const noExact = { ...freshAutoRgResults, rg_exact: undefined }
    expect(toGuinierFit(noExact)?.rg).toBe(40)
  })

  it('returns undefined for results lacking i0 (pre-Kratky autorg output)', () => {
    expect(
      toGuinierFit({ rg: 40, rg_min: 36, rg_max: 60, qmin: 0.01, qmax: 0.03 })
    ).toBeUndefined()
  })
})

describe('getGuinierFit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the cached fit without spawning AutoRg', async () => {
    const { default: fs } = await import('fs-extra')
    const { spawnAutoRgCalculator } = await import(
      '../../../controllers/jobs/utils/autoRg.js'
    )
    vi.mocked(fs.pathExists).mockResolvedValue(true as never)
    vi.mocked(fs.readJson).mockResolvedValue(freshAutoRgResults as never)

    const fit = await getGuinierFit('/data/uuid', 'experiment.dat')

    expect(fit).toMatchObject({ rg: 40.4, i0: 1234.5 })
    expect(spawnAutoRgCalculator).not.toHaveBeenCalled()
  })

  it('recomputes when the cache predates the i0 field', async () => {
    const { default: fs } = await import('fs-extra')
    const { spawnAutoRgCalculator } = await import(
      '../../../controllers/jobs/utils/autoRg.js'
    )
    // cache exists (stale), then experimental .dat exists
    vi.mocked(fs.pathExists).mockResolvedValue(true as never)
    vi.mocked(fs.readJson).mockResolvedValue({
      rg: 40,
      rg_min: 36,
      rg_max: 60,
      qmin: 0.01,
      qmax: 0.03
    } as never)
    vi.mocked(spawnAutoRgCalculator).mockResolvedValue(freshAutoRgResults)

    const fit = await getGuinierFit('/data/uuid', 'experiment.dat')

    expect(spawnAutoRgCalculator).toHaveBeenCalledWith(
      '/data/uuid',
      'experiment.dat'
    )
    expect(fs.writeJson).toHaveBeenCalledWith(
      '/data/uuid/autorg.json',
      freshAutoRgResults
    )
    expect(fit).toMatchObject({ rg: 40.4, i0: 1234.5 })
  })

  it('computes, caches, and returns the fit on a cache miss', async () => {
    const { default: fs } = await import('fs-extra')
    const { spawnAutoRgCalculator } = await import(
      '../../../controllers/jobs/utils/autoRg.js'
    )
    // no cache, but experimental .dat present
    vi.mocked(fs.pathExists)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never)
    vi.mocked(spawnAutoRgCalculator).mockResolvedValue(freshAutoRgResults)

    const fit = await getGuinierFit('/data/uuid', 'experiment.dat')

    expect(fs.writeJson).toHaveBeenCalledWith(
      '/data/uuid/autorg.json',
      freshAutoRgResults
    )
    expect(fit).toEqual({
      rg: 40.4,
      i0: 1234.5,
      qmin: 0.012,
      qmax: 0.032,
      r2: 0.99
    })
  })

  it('returns undefined when the experimental .dat file is missing', async () => {
    const { default: fs } = await import('fs-extra')
    const { spawnAutoRgCalculator } = await import(
      '../../../controllers/jobs/utils/autoRg.js'
    )
    vi.mocked(fs.pathExists).mockResolvedValue(false as never)

    const fit = await getGuinierFit('/data/uuid', 'experiment.dat')

    expect(fit).toBeUndefined()
    expect(spawnAutoRgCalculator).not.toHaveBeenCalled()
  })

  it('returns undefined (does not throw) when AutoRg fails', async () => {
    const { default: fs } = await import('fs-extra')
    const { spawnAutoRgCalculator } = await import(
      '../../../controllers/jobs/utils/autoRg.js'
    )
    vi.mocked(fs.pathExists)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never)
    vi.mocked(spawnAutoRgCalculator).mockRejectedValue(
      new Error('autorg blew up')
    )

    await expect(
      getGuinierFit('/data/uuid', 'experiment.dat')
    ).resolves.toBeUndefined()
  })
})
