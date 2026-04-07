import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response } from 'express'

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { countDocuments: vi.fn() },
  Job: { countDocuments: vi.fn(), aggregate: vi.fn() },
  MultiJob: { countDocuments: vi.fn() },
  UsageEvent: { aggregate: vi.fn() }
}))

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('@bilbomd/md-utils', () => ({
  discriminatorToPipeline: vi.fn((s: string) => s)
}))

import { User, Job as DBJob, MultiJob, UsageEvent } from '@bilbomd/mongodb-schema'
import { getSummaryAnalytics } from '../summary.js'
import { getJobsByStatus } from '../jobsByStatus.js'
import { getJobsByType } from '../jobsByType.js'
import { getJobsByUser } from '../jobsByUser.js'
import { getJobsTimeSeries } from '../jobsTimeSeries.js'
import { getUsageAccessModeSplit } from '../usageAccessModeSplit.js'
import { getUsageDailyCounts } from '../usageDailyCounts.js'
import { getUsageDurationStats } from '../usageDurationStats.js'
import { getUsagePerPipeline } from '../usagePerPipeline.js'
import { getUsageSuccessRate } from '../usageSuccessRate.js'

const makeMocks = () => {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const req = { query: {} } as unknown as Request
  const res = { json, status } as unknown as Response
  return { req, res, json, status }
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// getSummaryAnalytics
// ---------------------------------------------------------------------------
describe('getSummaryAnalytics', () => {
  it('returns aggregated counts and pipeline breakdown', async () => {
    const { req, res, json } = makeMocks()
    vi.mocked(User.countDocuments).mockReturnValue({ exec: vi.fn().mockResolvedValue(10) } as never)
    vi.mocked(DBJob.countDocuments)
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(50) } as never) // total jobs
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(40) } as never) // completed
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(5) } as never)  // failed
    vi.mocked(MultiJob.countDocuments).mockReturnValue({ exec: vi.fn().mockResolvedValue(3) } as never)
    vi.mocked(UsageEvent.aggregate).mockResolvedValue([{ pipeline: 'pdb', count: 20 }] as never)

    await getSummaryAnalytics(req, res)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        users: 10,
        jobs: 50,
        multijobs: 3,
        jobsCompleted: 40,
        jobsFailed: 5
      })
    )
  })

  it('returns 500 on error', async () => {
    const { req, res, status, json } = makeMocks()
    vi.mocked(User.countDocuments).mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('DB error'))
    } as never)
    vi.mocked(DBJob.countDocuments).mockReturnValue({ exec: vi.fn().mockResolvedValue(0) } as never)
    vi.mocked(MultiJob.countDocuments).mockReturnValue({ exec: vi.fn().mockResolvedValue(0) } as never)
    vi.mocked(UsageEvent.aggregate).mockResolvedValue([] as never)

    await getSummaryAnalytics(req, res)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('summary') }))
  })
})

// ---------------------------------------------------------------------------
// getJobsByStatus
// ---------------------------------------------------------------------------
describe('getJobsByStatus', () => {
  it('returns aggregated status counts', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ status: 'Completed', count: 30 }, { status: 'Failed', count: 5 }]
    vi.mocked(DBJob.aggregate).mockResolvedValue(data as never)

    await getJobsByStatus(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(DBJob.aggregate).mockRejectedValue(new Error('fail'))

    await getJobsByStatus(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getJobsByType
// ---------------------------------------------------------------------------
describe('getJobsByType', () => {
  it('maps discriminator to pipeline names and returns results', async () => {
    const { req, res, json } = makeMocks()
    vi.mocked(DBJob.aggregate).mockResolvedValue([{ pipeline: 'pdb', count: 10 }] as never)

    await getJobsByType(req, res)

    expect(json).toHaveBeenCalledWith([{ pipeline: 'pdb', count: 10 }])
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(DBJob.aggregate).mockRejectedValue(new Error('fail'))

    await getJobsByType(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getJobsByUser
// ---------------------------------------------------------------------------
describe('getJobsByUser', () => {
  it('returns per-user job counts', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ userId: 'user1', count: 7 }]
    vi.mocked(DBJob.aggregate).mockResolvedValue(data as never)

    await getJobsByUser(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(DBJob.aggregate).mockRejectedValue(new Error('fail'))

    await getJobsByUser(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getJobsTimeSeries
// ---------------------------------------------------------------------------
describe('getJobsTimeSeries', () => {
  it('returns time series data with no filters', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ day: '2025-01-01', count: 3 }]
    vi.mocked(DBJob.aggregate).mockResolvedValue(data as never)

    await getJobsTimeSeries(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('filters by start/end and status/type from query params', async () => {
    const { res, json } = makeMocks()
    const req = {
      query: { start: '2025-01-01', end: '2025-12-31', status: 'Completed', type: 'Pdb' }
    } as unknown as Request
    vi.mocked(DBJob.aggregate).mockResolvedValue([] as never)

    await getJobsTimeSeries(req, res)

    expect(DBJob.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $match: expect.objectContaining({ status: 'Completed' }) })
      ])
    )
    expect(json).toHaveBeenCalledWith([])
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(DBJob.aggregate).mockRejectedValue(new Error('fail'))

    await getJobsTimeSeries(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getUsageAccessModeSplit
// ---------------------------------------------------------------------------
describe('getUsageAccessModeSplit', () => {
  it('returns access mode split data', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ pipeline: 'pdb', access_mode: 'local', count: 5 }]
    vi.mocked(UsageEvent.aggregate).mockResolvedValue(data as never)

    await getUsageAccessModeSplit(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(UsageEvent.aggregate).mockRejectedValue(new Error('fail'))

    await getUsageAccessModeSplit(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getUsageDailyCounts
// ---------------------------------------------------------------------------
describe('getUsageDailyCounts', () => {
  it('returns daily count data with no date filters', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ pipeline: 'pdb', day: '2025-01-01', count: 2 }]
    vi.mocked(UsageEvent.aggregate).mockResolvedValue(data as never)

    await getUsageDailyCounts(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('applies date filters from query params', async () => {
    const { res } = makeMocks()
    const req = { query: { start: '2025-01-01', end: '2025-06-30' } } as unknown as Request
    vi.mocked(UsageEvent.aggregate).mockResolvedValue([] as never)

    await getUsageDailyCounts(req, res)

    expect(UsageEvent.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $match: expect.objectContaining({ timestamp: expect.any(Object) }) })
      ])
    )
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(UsageEvent.aggregate).mockRejectedValue(new Error('fail'))

    await getUsageDailyCounts(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getUsageDurationStats
// ---------------------------------------------------------------------------
describe('getUsageDurationStats', () => {
  it('returns duration stats per pipeline', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ pipeline: 'pdb', avgMs: 12000, count: 10 }]
    vi.mocked(UsageEvent.aggregate).mockResolvedValue(data as never)

    await getUsageDurationStats(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(UsageEvent.aggregate).mockRejectedValue(new Error('fail'))

    await getUsageDurationStats(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getUsagePerPipeline
// ---------------------------------------------------------------------------
describe('getUsagePerPipeline', () => {
  it('returns per-pipeline usage counts', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ pipeline: 'auto', count: 15 }]
    vi.mocked(UsageEvent.aggregate).mockResolvedValue(data as never)

    await getUsagePerPipeline(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(UsageEvent.aggregate).mockRejectedValue(new Error('fail'))

    await getUsagePerPipeline(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})

// ---------------------------------------------------------------------------
// getUsageSuccessRate
// ---------------------------------------------------------------------------
describe('getUsageSuccessRate', () => {
  it('returns success rate data per pipeline', async () => {
    const { req, res, json } = makeMocks()
    const data = [{ pipeline: 'pdb', successRate: 0.9, total: 10 }]
    vi.mocked(UsageEvent.aggregate).mockResolvedValue(data as never)

    await getUsageSuccessRate(req, res)

    expect(json).toHaveBeenCalledWith(data)
  })

  it('returns 500 on error', async () => {
    const { req, res, status } = makeMocks()
    vi.mocked(UsageEvent.aggregate).mockRejectedValue(new Error('fail'))

    await getUsageSuccessRate(req, res)

    expect(status).toHaveBeenCalledWith(500)
  })
})
