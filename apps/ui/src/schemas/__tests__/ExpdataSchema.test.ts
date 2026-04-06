import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'
import { expdataSchema } from '../ExpdataSchema'

vi.mock('../fieldTests/fieldTests', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v: unknown) => v != null),
  saxsCheck: () => mixed().test('pass', '', () => true),
  fileExtTest: (ext: string) =>
    mixed().test('ext', `Only accepts a *.${ext} file.`, (file: unknown) => {
      if (file instanceof File)
        return file.name.split('.').pop()?.toLowerCase() === ext.toLowerCase()
      return typeof file === 'string'
    }),
  fileSizeTest: (maxSize: number) =>
    mixed().test('size', `Max file size is ${maxSize}`, (file: unknown) => {
      if (file instanceof File) return file.size <= maxSize
      return typeof file === 'string'
    }),
  noSpacesTest: () => mixed().test('pass', '', () => true),
  fileNameLengthTest: () =>
    mixed().test(
      'len',
      'Filename must be no longer than 30 characters.',
      (file: unknown) => {
        if (file instanceof File) return file.name.length <= 30
        if (typeof file === 'string') return file.length <= 30
        return false
      }
    )
}))

const makeFile = (name: string, size = 100): File => {
  const blob = new Blob(['x'.repeat(size)], { type: 'text/plain' })
  const file = new File([blob], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('expdataSchema', () => {
  it('accepts a valid .dat file', async () => {
    const file = makeFile('data.dat', 100)
    await expect(expdataSchema.isValid(file)).resolves.toBe(true)
  })

  it('rejects null/undefined (required)', async () => {
    await expect(expdataSchema.isValid(null)).resolves.toBe(false)
    await expect(expdataSchema.isValid(undefined)).resolves.toBe(false)
  })

  it('rejects wrong extension', async () => {
    const file = makeFile('data.txt', 100)
    await expect(expdataSchema.isValid(file)).resolves.toBe(false)
  })

  it('rejects file exceeding 2MB', async () => {
    const file = makeFile('data.dat', 2_000_001)
    await expect(expdataSchema.isValid(file)).resolves.toBe(false)
  })

  it('accepts file exactly at 2MB limit', async () => {
    const file = makeFile('data.dat', 2_000_000)
    await expect(expdataSchema.isValid(file)).resolves.toBe(true)
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.dat', 100)
    await expect(expdataSchema.isValid(file)).resolves.toBe(false)
  })

  it('accepts a string (existing filename passthrough)', async () => {
    await expect(expdataSchema.isValid('existing.dat')).resolves.toBe(true)
  })
})
