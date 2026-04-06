import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../autoRg.js', () => ({
  spawnAutoRgCalculator: vi.fn()
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

import { maybeAutoCalculateRg } from '../maybeAutoCalculateRg.js'
import { spawnAutoRgCalculator } from '../autoRg.js'

const mockSpawn = spawnAutoRgCalculator as ReturnType<typeof vi.fn>

describe('maybeAutoCalculateRg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns provided values as Numbers when all rg fields are present', async () => {
    const result = await maybeAutoCalculateRg(
      { rg: 30, rg_min: 20, rg_max: 40 },
      true,
      '/tmp/job',
      'expdata.dat'
    )
    expect(result).toEqual({ rg: 30, rg_min: 20, rg_max: 40 })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('returns Numbers without calling spawn when rg is missing but isApiUser=false', async () => {
    const result = await maybeAutoCalculateRg(
      { rg: undefined, rg_min: 20, rg_max: 40 },
      false,
      '/tmp/job',
      'expdata.dat'
    )
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(result.rg_min).toBe(20)
    expect(result.rg_max).toBe(40)
  })

  it('calls spawnAutoRgCalculator and returns its result when rg missing + isApiUser=true', async () => {
    mockSpawn.mockResolvedValue({ rg: 35, rg_min: 25, rg_max: 45 })

    const result = await maybeAutoCalculateRg(
      { rg: undefined, rg_min: undefined, rg_max: undefined },
      true,
      '/tmp/job',
      'expdata.dat'
    )
    expect(mockSpawn).toHaveBeenCalledWith('/tmp/job', 'expdata.dat')
    expect(result).toEqual({ rg: 35, rg_min: 25, rg_max: 45 })
  })

  it('throws when spawnAutoRgCalculator fails and isApiUser=true', async () => {
    mockSpawn.mockRejectedValue(new Error('python not found'))

    await expect(
      maybeAutoCalculateRg(
        { rg: undefined, rg_min: undefined, rg_max: undefined },
        true,
        '/tmp/job',
        'expdata.dat'
      )
    ).rejects.toThrow('Failed to auto-calculate RG values')
  })
})
