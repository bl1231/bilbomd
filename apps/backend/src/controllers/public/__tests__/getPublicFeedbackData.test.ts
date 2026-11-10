import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Request, Response } from 'express'
import { getPublicFeedbackData } from '../getPublicFeedbackData.js'
import { publicJobQuery } from '../utils/publicJobQuery.js'

const { mockJobFindOne } = vi.hoisted(() => ({ mockJobFindOne: vi.fn() }))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findOne: mockJobFindOne }
}))

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response
  vi.mocked(res.status).mockReturnValue(res)
  return res
}

const makeReq = (publicId?: string | string[]) =>
  ({ params: { publicId } }) as unknown as Request

const found = (job: unknown) =>
  mockJobFindOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(job) })

const feedback = {
  version: 2,
  overall_chi_square: 0.98,
  findings: [
    {
      code: 'fit_excellent',
      severity: 'good',
      title: 'Excellent fit (χ² 0.98)',
      detail: 'The model fits the data to within the experimental errors.'
    }
  ],
  mw_saxs: null,
  mw_model: null,
  mw_err: null
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPublicFeedbackData', () => {
  it('returns the stored report for the job the token belongs to', async () => {
    found({ feedback })
    const res = makeRes()

    await getPublicFeedbackData(makeReq('tok'), res)

    expect(mockJobFindOne).toHaveBeenCalledWith(publicJobQuery('tok'))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(feedback)
  })

  it('uses the first value when the parameter arrives as an array', async () => {
    found({ feedback })

    await getPublicFeedbackData(makeReq(['tok', 'other']), makeRes())

    expect(mockJobFindOne).toHaveBeenCalledWith(publicJobQuery('tok'))
  })

  it('rejects a request without a token', async () => {
    const res = makeRes()

    await getPublicFeedbackData(makeReq(undefined), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockJobFindOne).not.toHaveBeenCalled()
  })

  it('answers 404 when no job matches the token', async () => {
    found(null)
    const res = makeRes()

    await getPublicFeedbackData(makeReq('nope'), res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      message: 'No job matches publicId nope.'
    })
  })

  it('answers 404 when the job has no report', async () => {
    found({ feedback: undefined })
    const res = makeRes()

    await getPublicFeedbackData(makeReq('tok'), res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      message: 'No feedback data found for publicId tok.'
    })
  })

  it('answers 500 when the lookup fails', async () => {
    mockJobFindOne.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('mongo down'))
    })
    const res = makeRes()

    await getPublicFeedbackData(makeReq('tok'), res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to retrieve public feedback data.'
    })
  })
})
