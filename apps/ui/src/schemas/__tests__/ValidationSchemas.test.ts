import { describe, it, expect } from 'vitest'
import {
  userRegisterSchema,
  userSignInSchema,
  editUserSchema
} from '../ValidationSchemas'

describe('userRegisterSchema', () => {
  it('accepts valid email and username', async () => {
    await expect(
      userRegisterSchema.isValid({ email: 'user@example.com', user: 'alice' })
    ).resolves.toBe(true)
  })

  it('rejects missing email', async () => {
    await expect(
      userRegisterSchema.isValid({ user: 'alice' })
    ).resolves.toBe(false)
  })

  it('rejects invalid email format', async () => {
    await expect(
      userRegisterSchema.isValid({ email: 'not-an-email', user: 'alice' })
    ).resolves.toBe(false)
  })

  it('rejects username shorter than 4 characters', async () => {
    await expect(
      userRegisterSchema.isValid({ email: 'u@example.com', user: 'ab' })
    ).resolves.toBe(false)
  })

  it('rejects username longer than 15 characters', async () => {
    await expect(
      userRegisterSchema.isValid({
        email: 'u@example.com',
        user: 'a'.repeat(16)
      })
    ).resolves.toBe(false)
  })

  it('accepts username at boundary lengths (4 and 15)', async () => {
    await expect(
      userRegisterSchema.isValid({ email: 'u@example.com', user: 'abcd' })
    ).resolves.toBe(true)
    await expect(
      userRegisterSchema.isValid({
        email: 'u@example.com',
        user: 'a'.repeat(15)
      })
    ).resolves.toBe(true)
  })
})

describe('userSignInSchema', () => {
  it('accepts valid email', async () => {
    await expect(
      userSignInSchema.isValid({ email: 'user@example.com' })
    ).resolves.toBe(true)
  })

  it('rejects missing email', async () => {
    await expect(userSignInSchema.isValid({})).resolves.toBe(false)
  })

  it('rejects invalid email format', async () => {
    await expect(
      userSignInSchema.isValid({ email: 'not-valid' })
    ).resolves.toBe(false)
  })
})

describe('editUserSchema', () => {
  it('accepts valid boolean active', async () => {
    await expect(editUserSchema.isValid({ active: true })).resolves.toBe(true)
    await expect(editUserSchema.isValid({ active: false })).resolves.toBe(true)
  })

  it('accepts empty object (active is not required)', async () => {
    await expect(editUserSchema.isValid({})).resolves.toBe(true)
  })
})
