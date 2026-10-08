import { describe, it, expect } from 'vitest'
import type { UserDTO } from '@bilbomd/bilbomd-types'
import {
  userStatusLabel,
  userStatusColor,
  filterUsers,
  quickFilterWords
} from '../usersListHelpers'

const user = (overrides: Partial<UserDTO>): UserDTO => ({
  id: 'u1',
  username: 'u1',
  email: 'u1@example.com',
  roles: ['User'],
  active: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides
})

describe('userStatusLabel', () => {
  it('is Inactive when an admin has switched the account off', () => {
    expect(userStatusLabel({ active: false, status: 'Active' })).toBe(
      'Inactive'
    )
  })

  it('is Pending while the email is unconfirmed', () => {
    expect(userStatusLabel({ active: true, status: 'Pending' })).toBe('Pending')
  })

  it('is Active otherwise, including when status is missing', () => {
    expect(userStatusLabel({ active: true })).toBe('Active')
    expect(userStatusLabel({ active: true, status: 'Active' })).toBe('Active')
  })

  it('maps each label to a chip color', () => {
    expect(userStatusColor('Active')).toBe('success')
    expect(userStatusColor('Pending')).toBe('warning')
    expect(userStatusColor('Inactive')).toBe('default')
  })
})

describe('filterUsers', () => {
  const users = [user({ id: 'a' }), user({ id: 'b', active: false })]

  it('hides inactive accounts by default', () => {
    expect(
      filterUsers(users, { showInactive: false }).map((u) => u.id)
    ).toEqual(['a'])
  })

  it('shows everyone when asked', () => {
    expect(filterUsers(users, { showInactive: true })).toHaveLength(2)
  })
})

describe('quickFilterWords', () => {
  it('splits on whitespace and drops empties', () => {
    expect(quickFilterWords('  scott   admin ')).toEqual(['scott', 'admin'])
    expect(quickFilterWords('')).toEqual([])
  })
})
