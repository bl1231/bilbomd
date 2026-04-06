import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'

vi.mock('../helpers/fileValidators.js', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v) => v != null && typeof v === 'object'),
  fileExtTest: () => mixed(),
  fileSizeTest: () => mixed(),
  fileNameLengthTest: () => mixed(),
  noSpacesTest: () => mixed(),
  saxsCheck: () => mixed(),
  constInpCheck: () => mixed(),
  crdCheck: () => mixed(),
  psfCheck: () => mixed()
}))

import { crdJobSchema } from '../crdJobSchema.js'

const multerFile = (name = 'file.dat') => ({
  originalname: name,
  path: `/tmp/${name}`,
  size: 100
})

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('crdJobSchema - title', () => {
  it('accepts a valid title', async () => {
    await expect(
      crdJobSchema.validateAt('title', { title: 'My CRD Job' })
    ).resolves.toBe('My CRD Job')
  })

  it('rejects missing title', async () => {
    await expect(
      crdJobSchema.validateAt('title', { title: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects title longer than 100 characters', async () => {
    await expect(
      crdJobSchema.validateAt('title', { title: 'a'.repeat(101) })
    ).rejects.toThrow('too long')
  })
})

// ---------------------------------------------------------------------------
// bilbomd_mode
// ---------------------------------------------------------------------------
describe('crdJobSchema - bilbomd_mode', () => {
  it('accepts "crd_psf"', async () => {
    await expect(
      crdJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'crd_psf' })
    ).resolves.toBe('crd_psf')
  })

  it('rejects other modes', async () => {
    await expect(
      crdJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'pdb' })
    ).rejects.toBeTruthy()
    await expect(
      crdJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'auto' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing bilbomd_mode', async () => {
    await expect(
      crdJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------
describe('crdJobSchema - email', () => {
  it('accepts a valid email', async () => {
    await expect(
      crdJobSchema.validateAt('email', { email: 'user@example.com' })
    ).resolves.toBe('user@example.com')
  })

  it('accepts missing email (optional)', async () => {
    await expect(
      crdJobSchema.validateAt('email', { email: undefined })
    ).resolves.toBeUndefined()
  })

  it('rejects invalid email format', async () => {
    await expect(
      crdJobSchema.validateAt('email', { email: 'bad-email' })
    ).rejects.toThrow('Invalid email address')
  })
})

// ---------------------------------------------------------------------------
// required file fields
// ---------------------------------------------------------------------------
describe('crdJobSchema - required files', () => {
  it('rejects missing dat_file', async () => {
    await expect(
      crdJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing const_inp_file', async () => {
    await expect(
      crdJobSchema.validateAt('const_inp_file', { const_inp_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing crd_file', async () => {
    await expect(
      crdJobSchema.validateAt('crd_file', { crd_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing psf_file', async () => {
    await expect(
      crdJobSchema.validateAt('psf_file', { psf_file: undefined })
    ).rejects.toThrow('required')
  })

  it('accepts a multer file object for each file field', async () => {
    for (const [field, name] of [
      ['dat_file', 'data.dat'],
      ['const_inp_file', 'const.inp'],
      ['crd_file', 'coords.crd'],
      ['psf_file', 'top.psf']
    ] as const) {
      await expect(
        crdJobSchema.validateAt(field, { [field]: multerFile(name) })
      ).resolves.toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// rg / rg_min / rg_max
// ---------------------------------------------------------------------------
describe('crdJobSchema - rg', () => {
  it('accepts values between 10 and 100', async () => {
    await expect(crdJobSchema.validateAt('rg', { rg: 50 })).resolves.toBe(50)
  })

  it('rejects values outside 10–100', async () => {
    await expect(
      crdJobSchema.validateAt('rg', { rg: 9 })
    ).rejects.toBeTruthy()
    await expect(
      crdJobSchema.validateAt('rg', { rg: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg', async () => {
    await expect(
      crdJobSchema.validateAt('rg', { rg: undefined })
    ).rejects.toThrow('required')
  })
})

describe('crdJobSchema - rg_min / rg_max', () => {
  it('accepts rg_min and rg_max in range', async () => {
    await expect(
      crdJobSchema.validateAt('rg_min', { rg_min: 20 })
    ).resolves.toBe(20)
    await expect(
      crdJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 50 })
    ).resolves.toBe(50)
  })

  it('rejects rg_max not greater than rg_min', async () => {
    await expect(
      crdJobSchema.validateAt('rg_max', { rg_min: 30, rg_max: 30 })
    ).rejects.toThrow('greater than')
    await expect(
      crdJobSchema.validateAt('rg_max', { rg_min: 50, rg_max: 20 })
    ).rejects.toThrow('greater than')
  })

  it('rejects missing rg_min and rg_max', async () => {
    await expect(
      crdJobSchema.validateAt('rg_min', { rg_min: undefined })
    ).rejects.toThrow('required')
    await expect(
      crdJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: undefined })
    ).rejects.toThrow('required')
  })
})
