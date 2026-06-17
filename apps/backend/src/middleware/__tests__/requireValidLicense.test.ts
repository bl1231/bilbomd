import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { requireValidLicense } from '../requireValidLicense.js'
import { getLicenseState } from '../../license/verifyLicense.js'

vi.mock('../../license/verifyLicense.js', () => ({
  getLicenseState: vi.fn()
}))

const mockedGetLicenseState = vi.mocked(getLicenseState)

describe('requireValidLicense middleware', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy })
    req = { originalUrl: '/api/v1/jobs' }
    res = {
      status: statusSpy as unknown as Response['status'],
      json: jsonSpy as unknown as Response['json']
    }
    next = vi.fn()
  })

  it('calls next() when the license is valid', () => {
    mockedGetLicenseState.mockReturnValue({ status: 'valid' })
    requireValidLicense(req as Request, res as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(statusSpy).not.toHaveBeenCalled()
  })

  it.each(['missing', 'invalid', 'expired'] as const)(
    'returns 403 when the license is %s',
    (status) => {
      mockedGetLicenseState.mockReturnValue({
        status,
        expiresAt: '2020-01-01T00:00:00.000Z'
      })
      requireValidLicense(req as Request, res as Response, next)
      expect(next).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(403)
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('valid BilboMD license'),
          license: { status, expiresAt: '2020-01-01T00:00:00.000Z' }
        })
      )
    }
  )
})
