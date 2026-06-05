import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { Model } from 'mongoose'

vi.mock('../../config/config.js', () => ({
  config: { sendEmailNotifications: false },
  getEnvVar: vi.fn().mockReturnValue('https://bilbomd.example.com')
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: vi.fn(), create: vi.fn() }
}))

vi.mock('../../config/nodemailerConfig.js', () => ({
  sendVerificationEmail: vi.fn()
}))

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'
import { handleNewUser } from '../registerController.js'

const makeReq = (body: unknown): Request => ({ body }) as Request
const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

// Build the chainable findOne mock the controller uses:
// User.findOne(filter).collation(...).lean().exec()
const captured: Record<string, unknown>[] = []
const findOneChain = (result: unknown) => ({
  collation: () => ({ lean: () => ({ exec: () => Promise.resolve(result) }) })
})

// Cast a captured filter through mongoose's sanitizeFilter + schema casting
// using the REAL User schema, exactly as query execution would. Returns a
// CastError if the (sanitized) filter is invalid — which is what previously
// produced a 500 for the previous-email `$in` lookup.
const filterCastError = <T>(
  model: Model<T>,
  filter: Record<string, unknown>
): Error | null => {
  const query = model.find(filter as never, null, {
    sanitizeFilter: true
  })
  ;(query as unknown as { _castConditions: () => void })._castConditions()
  return (query as unknown as { error: () => Error | null }).error() ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
  captured.length = 0
})

describe('handleNewUser', () => {
  it('returns 400 when username or email is missing', async () => {
    const res = makeRes()
    await handleNewUser(makeReq({ user: 'scott' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('creates a new user and never passes a bare operator filter to findOne', async () => {
    // No existing user matches any of the duplicate checks.
    vi.mocked(User.findOne).mockImplementation((filter) => {
      captured.push(filter as unknown as Record<string, unknown>)
      return findOneChain(null) as never
    })
    vi.mocked(User.create).mockResolvedValue({ username: 'scott' } as never)

    const res = makeRes()
    await handleNewUser(
      makeReq({ user: 'scott', email: 'scott@example.com' }),
      res
    )

    expect(res.status).toHaveBeenCalledWith(201)
    // All three duplicate checks ran: username, email, previousEmails.
    expect(captured).toHaveLength(3)

    // The regression guard: every filter the controller hands to findOne must
    // survive mongoose's sanitizeFilter + cast against the real User schema. A
    // bare `{ previousEmails: { $in: [...] } }` (the original bug) would throw
    // a CastError here and fail this test.
    const { User: RealUser } = await vi.importActual<
      typeof import('@bilbomd/mongodb-schema')
    >('@bilbomd/mongodb-schema')
    for (const filter of captured) {
      expect(filterCastError(RealUser, filter)).toBeNull()
    }
  })

  it('returns 409 on a duplicate username', async () => {
    vi.mocked(User.findOne).mockImplementationOnce(
      () => findOneChain({ username: 'scott' }) as never
    )

    const res = makeRes()
    await handleNewUser(
      makeReq({ user: 'scott', email: 'scott@example.com' }),
      res
    )

    expect(res.status).toHaveBeenCalledWith(409)
    expect(User.create).not.toHaveBeenCalled()
  })
})
