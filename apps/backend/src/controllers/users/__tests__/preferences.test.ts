import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findOne: vi.fn(), findOneAndUpdate: vi.fn() }
}))
vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'
import { getPreferences, updatePreferences } from '../preferences.js'

const makeReq = (body?: unknown): Request =>
  ({ user: 'alice', body }) as unknown as Request
const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

const findOneReturning = (user: unknown) =>
  vi.mocked(User.findOne).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(user) })
  } as never)
const findOneAndUpdateReturning = (user: unknown) =>
  vi.mocked(User.findOneAndUpdate).mockReturnValue({
    lean: () => Promise.resolve(user)
  } as never)

beforeEach(() => vi.clearAllMocks())

describe('getPreferences', () => {
  it("returns the signed-in user's setting", async () => {
    findOneReturning({ emailNotifications: false })
    const res = makeRes()

    await getPreferences(makeReq(), res)

    expect(User.findOne).toHaveBeenCalledWith({ username: 'alice' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ emailNotifications: false })
  })

  it('treats users created before the setting existed as opted in', async () => {
    findOneReturning({})
    const res = makeRes()

    await getPreferences(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith({ emailNotifications: true })
  })

  it('returns 404 when the user is gone', async () => {
    findOneReturning(null)
    const res = makeRes()

    await getPreferences(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('updatePreferences', () => {
  it("updates only the signed-in user's own setting", async () => {
    findOneAndUpdateReturning({ emailNotifications: false })
    const res = makeRes()

    await updatePreferences(makeReq({ emailNotifications: false }), res)

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { username: 'alice' },
      { $set: { emailNotifications: false } },
      expect.anything()
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ emailNotifications: false })
  })

  it.each([undefined, 'false', 0, null])(
    'rejects a non-boolean value (%j)',
    async (emailNotifications) => {
      const res = makeRes()

      await updatePreferences(makeReq({ emailNotifications }), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(User.findOneAndUpdate).not.toHaveBeenCalled()
    }
  )

  it('rejects a missing body', async () => {
    const res = makeRes()

    await updatePreferences(makeReq(undefined), res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 when the update fails', async () => {
    vi.mocked(User.findOneAndUpdate).mockReturnValue({
      lean: () => Promise.reject(new Error('mongo down'))
    } as never)
    const res = makeRes()

    await updatePreferences(makeReq({ emailNotifications: true }), res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
