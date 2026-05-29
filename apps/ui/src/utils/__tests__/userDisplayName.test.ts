import { describe, it, expect } from 'vitest'
import { userDisplayName } from '../userDisplayName'

describe('userDisplayName (UI)', () => {
  it('returns "First Last" when both names are present', () => {
    expect(
      userDisplayName({
        username: 'orcid-x',
        firstName: 'Scott',
        lastName: 'Classen'
      })
    ).toBe('Scott Classen')
  })

  it('returns first name only when last is missing', () => {
    expect(
      userDisplayName({ username: 'u', firstName: 'Scott' })
    ).toBe('Scott')
  })

  it('returns last name only when first is missing', () => {
    expect(
      userDisplayName({ username: 'u', lastName: 'Classen' })
    ).toBe('Classen')
  })

  it('falls back to username when no names', () => {
    expect(userDisplayName({ username: 'fallback' })).toBe('fallback')
  })

  it('falls back to empty string when even username is absent', () => {
    expect(userDisplayName({})).toBe('')
  })

  it('treats null and undefined name fields equivalently', () => {
    expect(
      userDisplayName({
        username: 'u',
        firstName: null,
        lastName: null
      })
    ).toBe('u')
  })
})
