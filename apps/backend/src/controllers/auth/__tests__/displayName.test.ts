import { describe, it, expect } from 'vitest'
import { userDisplayName } from '../displayName.js'

describe('userDisplayName', () => {
  it('returns "First Last" when both names are present', () => {
    expect(
      userDisplayName({
        username: 'orcid-0000-0002-1234-5678',
        firstName: 'Scott',
        lastName: 'Classen'
      })
    ).toBe('Scott Classen')
  })

  it('returns just the first name when last name is absent', () => {
    expect(
      userDisplayName({
        username: 'orcid-x',
        firstName: 'Scott',
        lastName: null
      })
    ).toBe('Scott')
  })

  it('returns just the last name when first name is absent', () => {
    expect(
      userDisplayName({
        username: 'orcid-x',
        firstName: undefined,
        lastName: 'Classen'
      })
    ).toBe('Classen')
  })

  it('falls back to username when both names are missing', () => {
    expect(
      userDisplayName({
        username: 'legacy_user',
        firstName: null,
        lastName: null
      })
    ).toBe('legacy_user')
  })

  it('trims whitespace from first and last names', () => {
    expect(
      userDisplayName({
        username: 'u',
        firstName: '  Scott  ',
        lastName: '  Classen  '
      })
    ).toBe('Scott Classen')
  })

  it('treats whitespace-only names as missing and falls back to username', () => {
    expect(
      userDisplayName({
        username: 'fallback',
        firstName: '   ',
        lastName: '   '
      })
    ).toBe('fallback')
  })
})
