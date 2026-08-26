import { describe, it, expect } from 'vitest'
import { ValidationError } from 'yup'
import {
  titleSchema,
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH
} from '../titleSchema'

describe('titleSchema', () => {
  const schema = titleSchema()

  it('accepts a valid title with letters, numbers, spaces, and hyphens', async () => {
    await expect(schema.validate('My-Job 123')).resolves.toBe('My-Job 123')
  })

  it('accepts a title at exactly the minimum length', async () => {
    const min = 'a'.repeat(TITLE_MIN_LENGTH)
    await expect(schema.validate(min)).resolves.toBe(min)
  })

  it('accepts a title at exactly the maximum length', async () => {
    const max = 'a'.repeat(TITLE_MAX_LENGTH)
    await expect(schema.validate(max)).resolves.toBe(max)
  })

  it('rejects a title shorter than the minimum length', async () => {
    await expect(
      schema.validate('a'.repeat(TITLE_MIN_LENGTH - 1))
    ).rejects.toThrow('at least 4 characters')
  })

  it('rejects a title longer than the maximum length', async () => {
    await expect(
      schema.validate('a'.repeat(TITLE_MAX_LENGTH + 1))
    ).rejects.toThrow('less than 30 characters')
  })

  it('rejects a title with special characters', async () => {
    await expect(schema.validate('Bad@Title!')).rejects.toThrow(
      'No special characters'
    )
  })

  it('rejects a missing title with the required message', async () => {
    await expect(schema.validate(undefined)).rejects.toThrow(
      'Please provide a title for your BilboMD Job.'
    )
  })

  it('uses the provided job label in the required message', async () => {
    await expect(
      titleSchema('BilboMD SANS Job').validate(undefined)
    ).rejects.toThrow('Please provide a title for your BilboMD SANS Job.')
  })

  it('surfaces validation failures as Yup ValidationErrors', async () => {
    await expect(schema.validate('a')).rejects.toBeInstanceOf(ValidationError)
  })

  it('exposes the canonical length bounds', () => {
    expect(TITLE_MIN_LENGTH).toBe(4)
    expect(TITLE_MAX_LENGTH).toBe(30)
  })
})
