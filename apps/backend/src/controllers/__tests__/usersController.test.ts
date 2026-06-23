import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../config/config.js', () => ({
  getEnvVar: vi.fn().mockReturnValue('https://bilbomd.example.com')
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: { findById: vi.fn(), findOne: vi.fn() },
  Job: { findOne: vi.fn(), exists: vi.fn() }
}))

vi.mock('../../config/nodemailerConfig.js', () => ({
  sendOtpEmail: vi.fn(),
  sendUpdatedEmailMessage: vi.fn(),
  sendDeleteAccountSuccessEmail: vi.fn()
}))

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}))

import { User } from '@bilbomd/mongodb-schema'
import { updateUser } from '../usersController.js'

const makeReq = (body: unknown): Request => ({ body }) as Request
const makeRes = (): Response => {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

// Chain the controller uses for the duplicate-email lookup:
// User.findOne({ email }).collation(...).lean().exec()
const findOneChain = (result: unknown) => ({
  collation: () => ({ lean: () => ({ exec: () => Promise.resolve(result) }) })
})

const validBody = {
  id: 'user-1',
  roles: ['User'],
  active: true,
  email: 'user@example.com'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateUser', () => {
  it('returns 400 when id is missing', async () => {
    const res = makeRes()
    await updateUser(makeReq({ ...validBody, id: undefined }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'User ID is required'
    })
  })

  it('returns 400 when roles are missing or empty', async () => {
    const res = makeRes()
    await updateUser(makeReq({ ...validBody, roles: [] }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Roles are required'
    })
  })

  it('returns 400 when active is not a boolean', async () => {
    const res = makeRes()
    await updateUser(makeReq({ ...validBody, active: 'yes' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Active status is required'
    })
  })

  it('returns 400 when email is invalid', async () => {
    const res = makeRes()
    await updateUser(makeReq({ ...validBody, email: 'not-an-email' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid email format'
    })
  })

  it('does NOT require a username (regression for "Invalid username format")', async () => {
    const save = vi.fn().mockResolvedValue({ username: 'scott' })
    vi.mocked(User.findById).mockReturnValue({
      exec: () =>
        Promise.resolve({ username: 'scott', roles: [], active: false, save })
    } as never)
    vi.mocked(User.findOne).mockReturnValue(findOneChain(null) as never)

    const res = makeRes()
    // Body intentionally has no `username` field.
    await updateUser(makeReq(validBody), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(save).toHaveBeenCalled()
  })

  it('returns 404 when the user does not exist', async () => {
    vi.mocked(User.findById).mockReturnValue({
      exec: () => Promise.resolve(null)
    } as never)

    const res = makeRes()
    await updateUser(makeReq(validBody), res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 409 when the email belongs to another user', async () => {
    const save = vi.fn()
    vi.mocked(User.findById).mockReturnValue({
      exec: () => Promise.resolve({ username: 'scott', save })
    } as never)
    vi.mocked(User.findOne).mockReturnValue(
      findOneChain({ _id: 'someone-else' }) as never
    )

    const res = makeRes()
    await updateUser(makeReq(validBody), res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Duplicate email'
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('updates roles, active, and email then saves', async () => {
    const user = {
      username: 'scott',
      roles: ['User'],
      active: false,
      email: 'old@example.com',
      save: vi.fn().mockResolvedValue({ username: 'scott' })
    }
    vi.mocked(User.findById).mockReturnValue({
      exec: () => Promise.resolve(user)
    } as never)
    // Duplicate-email lookup finds the same user (its own _id) -> allowed.
    vi.mocked(User.findOne).mockReturnValue(
      findOneChain({ _id: 'user-1' }) as never
    )

    const res = makeRes()
    await updateUser(
      makeReq({
        id: 'user-1',
        roles: ['Admin', 'User'],
        active: true,
        email: 'new@example.com'
      }),
      res
    )

    expect(user.roles).toEqual(['Admin', 'User'])
    expect(user.active).toBe(true)
    expect(user.email).toBe('new@example.com')
    expect(user.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'scott updated'
    })
  })
})
