import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { User } from '@bilbomd/mongodb-schema'
import { wantsJobEmails } from '../emailPreferences.js'

const storedUser = (user: unknown) => {
  const exec = vi.fn().mockResolvedValue(user)
  vi.spyOn(User, 'findById').mockReturnValue({
    select: () => ({ lean: () => ({ exec }) })
  } as never)
}

const id = new Types.ObjectId()

beforeEach(() => vi.restoreAllMocks())

describe('wantsJobEmails', () => {
  it('is true for users who never changed the setting', async () => {
    storedUser({})
    expect(await wantsJobEmails(id)).toBe(true)
  })

  it('follows the stored setting', async () => {
    storedUser({ emailNotifications: false })
    expect(await wantsJobEmails(id)).toBe(false)
    storedUser({ emailNotifications: true })
    expect(await wantsJobEmails(id)).toBe(true)
  })

  it("reads the setting from the User collection, not the job's copy", async () => {
    storedUser({ emailNotifications: false })
    // The user embedded in a job has no emailNotifications field
    const embedded = { _id: id, username: 'alice', email: 'a@example.com' }

    expect(await wantsJobEmails(embedded)).toBe(false)
    expect(User.findById).toHaveBeenCalledWith(id)
  })

  it('accepts an id string', async () => {
    storedUser({})
    expect(await wantsJobEmails(id.toString())).toBe(true)
  })

  it('is false when there is no user to email', async () => {
    const findById = vi.spyOn(User, 'findById')
    expect(await wantsJobEmails(undefined)).toBe(false)
    expect(await wantsJobEmails({})).toBe(false)
    expect(await wantsJobEmails('not-an-id')).toBe(false)
    expect(findById).not.toHaveBeenCalled()

    storedUser(null)
    expect(await wantsJobEmails(id)).toBe(false)
  })
})
