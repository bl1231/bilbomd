import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import type { Request, Response } from 'express'

vi.mock('../../config/config.js', () => ({
  getEnvVar: vi.fn().mockReturnValue('https://bilbomd.example.com')
}))

vi.mock('@bilbomd/mongodb-schema', () => ({
  User: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn()
  },
  Job: {
    findOne: vi.fn(),
    exists: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    countDocuments: vi.fn()
  },
  UsageEvent: { updateMany: vi.fn() }
}))

vi.mock('../../config/nodemailerConfig.js', () => ({
  sendOtpEmail: vi.fn(),
  sendUpdatedEmailMessage: vi.fn(),
  sendDeleteAccountSuccessEmail: vi.fn()
}))

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}))

import { User, Job, UsageEvent } from '@bilbomd/mongodb-schema'
import { sendDeleteAccountSuccessEmail } from '../../config/nodemailerConfig.js'
import {
  updateUser,
  deleteUserByUsername,
  getAllUsers,
  getUser
} from '../usersController.js'

// `user` is the caller's username, as set on the request by verifyJWT.
const makeReq = (body: unknown, user?: string): Request =>
  ({ body, user }) as Request
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

  describe('editing your own account', () => {
    const self = () => ({
      username: 'scott',
      roles: ['Admin', 'User'],
      active: true,
      email: 'scott@example.com',
      save: vi.fn().mockResolvedValue({ username: 'scott' })
    })

    beforeEach(() => {
      vi.mocked(User.findById).mockReturnValue({
        exec: () => Promise.resolve(self())
      } as never)
      vi.mocked(User.findOne).mockReturnValue(
        findOneChain({ _id: 'user-1' }) as never
      )
    })

    it('refuses to deactivate yourself', async () => {
      const res = makeRes()
      await updateUser(
        makeReq({ ...validBody, roles: ['Admin'], active: false }, 'scott'),
        res
      )
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'You cannot deactivate your own account'
      })
    })

    it('refuses to drop your own Admin/Manager role', async () => {
      const res = makeRes()
      await updateUser(makeReq({ ...validBody, roles: ['User'] }, 'scott'), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'You cannot remove your own Admin or Manager role'
      })
    })

    it('allows a self-edit that keeps you active with Manager access', async () => {
      const res = makeRes()
      await updateUser(
        makeReq({ ...validBody, roles: ['Manager', 'User'] }, 'scott'),
        res
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('still lets you demote or deactivate someone else', async () => {
      const res = makeRes()
      await updateUser(
        makeReq(
          { ...validBody, roles: ['User'], active: false },
          'other-admin'
        ),
        res
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })
})

describe('deleteUserByUsername', () => {
  const userId = { toString: () => 'abc123' }
  const makeDeleteReq = (username: string): Request =>
    ({ params: { username } }) as unknown as Request
  const findUser = (user: unknown) =>
    vi
      .mocked(User.findOne)
      .mockReturnValue({ exec: () => Promise.resolve(user) } as never)
  const updateResult = (modifiedCount: number) =>
    vi.mocked(User.updateOne).mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount })
    } as never)
  const updateManyResolves = () => {
    for (const model of [Job, UsageEvent]) {
      vi.mocked(model.updateMany).mockReturnValue({
        exec: () => Promise.resolve({ modifiedCount: 1 })
      } as never)
    }
  }

  it('returns 404 for an unknown user', async () => {
    findUser(null)
    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 404 for an already deleted user', async () => {
    findUser({ _id: userId, username: 'scott', deletedAt: new Date() })
    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(User.updateOne).not.toHaveBeenCalled()
  })

  it('refuses while the user has unfinished jobs', async () => {
    findUser({ _id: userId, username: 'scott', email: 's@example.com' })
    vi.mocked(Job.exists).mockResolvedValue({ _id: 'job-1' } as never)

    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)

    expect(Job.exists).toHaveBeenCalledWith({
      'user._id': userId,
      status: mongoose.trusted({ $in: ['Submitted', 'Pending', 'Running'] })
    })
    expect(res.status).toHaveBeenCalledWith(409)
    expect(User.updateOne).not.toHaveBeenCalled()
  })

  it('deactivates and scrubs the account instead of deleting it', async () => {
    findUser({ _id: userId, username: 'scott', email: 's@example.com' })
    vi.mocked(Job.exists).mockResolvedValue(null)
    updateResult(1)
    updateManyResolves()

    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      {
        $set: expect.objectContaining({
          username: 'deleted-abc123',
          email: 'deleted-abc123@deleted.invalid',
          active: false,
          deletedAt: expect.any(Date),
          previousEmails: [],
          oauth: [],
          refreshToken: [],
          apiTokens: []
        }),
        $unset: expect.objectContaining({ firstName: '', lastName: '' })
      }
    )
    expect(Job.updateMany).toHaveBeenCalledWith(
      { 'user._id': userId },
      {
        $set: {
          'user.username': 'deleted-abc123',
          'user.email': 'deleted-abc123@deleted.invalid'
        }
      }
    )
    expect(UsageEvent.updateMany).toHaveBeenCalledWith(
      { 'context.user._id': userId },
      {
        $set: {
          'context.user.username': 'deleted-abc123',
          'context.user.email': 'deleted-abc123@deleted.invalid'
        }
      }
    )
    expect(sendDeleteAccountSuccessEmail).toHaveBeenCalledWith(
      's@example.com',
      'scott'
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('still succeeds when scrubbing jobs fails', async () => {
    findUser({ _id: userId, username: 'scott', email: 's@example.com' })
    vi.mocked(Job.exists).mockResolvedValue(null)
    updateResult(1)
    updateManyResolves()
    vi.mocked(Job.updateMany).mockReturnValue({
      exec: () => Promise.reject(new Error('boom'))
    } as never)

    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(sendDeleteAccountSuccessEmail).toHaveBeenCalled()
  })

  it('returns 500 when nothing was updated', async () => {
    findUser({ _id: userId, username: 'scott', email: 's@example.com' })
    vi.mocked(Job.exists).mockResolvedValue(null)
    updateResult(0)

    const res = makeRes()
    await deleteUserByUsername(makeDeleteReq('scott'), res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(sendDeleteAccountSuccessEmail).not.toHaveBeenCalled()
  })
})

// A user document as stored, including the secret material that must never
// reach the admin UI.
const storedUser = () => ({
  _id: 'user-1',
  username: 'scott',
  email: 'scott@example.com',
  roles: ['Admin'],
  firstName: 'Scott',
  lastName: null,
  status: 'Active',
  active: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-02-01T00:00:00Z'),
  UUID: 'uuid-1',
  last_access: new Date('2024-03-01T00:00:00Z'),
  oauth: [{ provider: 'orcid', id: '0000-0002-1234-5678', name: 'Scott' }],
  refreshToken: ['secret-refresh'],
  apiTokens: [{ tokenHash: 'secret-hash', label: 'cli' }],
  otp: { code: '123456' },
  confirmationCode: { code: 'abc' }
})

// What the admin UI should see for storedUser(): no secrets, derived fields.
const expectedView = (jobCount: number) => ({
  _id: 'user-1',
  username: 'scott',
  email: 'scott@example.com',
  roles: ['Admin'],
  firstName: 'Scott',
  lastName: null,
  status: 'Active',
  active: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-02-01T00:00:00Z'),
  UUID: 'uuid-1',
  lastAccess: new Date('2024-03-01T00:00:00Z'),
  emailNotifications: true,
  oauthProviders: ['orcid'],
  jobCount
})

// Chain the controller uses: User.find(filter).select(fields).lean()
const findChain = (result: unknown) => ({
  select: vi.fn().mockReturnValue({ lean: () => Promise.resolve(result) })
})

describe('getAllUsers', () => {
  beforeEach(() => {
    vi.mocked(Job.aggregate).mockResolvedValue([] as never)
  })

  it('leaves out deleted accounts', async () => {
    vi.mocked(User.find).mockReturnValue(findChain([]) as never)

    const res = makeRes()
    await getAllUsers({} as Request, res)

    expect(User.find).toHaveBeenCalledWith({
      deletedAt: mongoose.trusted({ $exists: false })
    })
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] })
  })

  it('returns only the admin-safe fields, never tokens or codes', async () => {
    const chain = findChain([storedUser()])
    vi.mocked(User.find).mockReturnValue(chain as never)
    vi.mocked(Job.aggregate).mockResolvedValue([
      { _id: 'user-1', count: 3 }
    ] as never)

    const res = makeRes()
    await getAllUsers({} as Request, res)

    // The query itself projects to an allowlist...
    const projection = chain.select.mock.calls[0][0] as string
    for (const secret of [
      'refreshToken',
      'apiTokens',
      'otp',
      'confirmationCode'
    ])
      expect(projection).not.toContain(secret)
    expect(projection).toContain('oauth.provider')

    // ...and the response is re-shaped, so stray fields are dropped too.
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [expectedView(3)]
    })
  })

  it('reports zero jobs for users with no jobs', async () => {
    vi.mocked(User.find).mockReturnValue(findChain([storedUser()]) as never)

    const res = makeRes()
    await getAllUsers({} as Request, res)

    const body = vi.mocked(res.json).mock.calls[0][0] as {
      data: Array<{ jobCount: number }>
    }
    expect(body.data[0].jobCount).toBe(0)
  })
})

describe('getUser', () => {
  it('returns the same admin-safe shape with a live job count', async () => {
    const select = vi.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(storedUser()) })
    })
    vi.mocked(User.findOne).mockReturnValue({ select } as never)
    vi.mocked(Job.countDocuments).mockResolvedValue(2 as never)

    const res = makeRes()
    await getUser({ params: { id: 'user-1' } } as unknown as Request, res)

    expect(Job.countDocuments).toHaveBeenCalledWith({ 'user._id': 'user-1' })
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expectedView(2)
    })
  })

  it('returns 404 for an unknown id', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve(null) }) })
    } as never)

    const res = makeRes()
    await getUser({ params: { id: 'nope' } } as unknown as Request, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})
