import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'
import { BilboMDClassicJobSchema } from '../BilboMDClassicJobSchema'

vi.mock('../fieldTests/fieldTests', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v: unknown) => v != null),
  fileSizeTest: (maxSize: number) =>
    mixed().test(
      'file-size-check',
      `Max file size is ${maxSize / 1_000_000}MB`,
      (file: unknown) => {
        if (file instanceof File) return file.size <= maxSize
        return typeof file === 'string'
      }
    ),
  fileExtTest: (ext: string) =>
    mixed().test(
      'file-type-check',
      `Only accepts a *.${ext} file.`,
      (file: unknown) => {
        if (file instanceof File)
          return file.name.split('.').pop()?.toLowerCase() === ext.toLowerCase()
        return typeof file === 'string'
      }
    ),
  fileNameLengthTest: () =>
    mixed().test(
      'filename-length-check',
      'Filename must be no longer than 30 characters.',
      (file: unknown) => {
        if (file instanceof File) return file.name.length <= 30
        if (typeof file === 'string') return file.length <= 30
        return false
      }
    ),
  noSpacesTest: () => mixed(),
  saxsCheck: () => mixed(),
  psfCheck: () => mixed(),
  crdCheck: () => mixed(),
  pdbCheck: () => mixed(),
  chainIdCheck: () => mixed(),
  pdbLineStartCheck: () => mixed(),
  constInpCheck: () => mixed(),
  pdbOrCifExtTest: () => mixed(),
  pdbOrCifChainIdCheck: () => mixed(),
  pdbOrCifResidueCheck: () => mixed()
}))

const makeFile = (name: string, size = 100): File => {
  const blob = new Blob(['x'.repeat(size)], { type: 'text/plain' })
  const file = new File([blob], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('BilboMDClassicJobSchema - md_engine', () => {
  it('allows charmm and openmm', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - bilbomd_mode', () => {
  it('requires bilbomd_mode', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('bilbomd_mode', {
        bilbomd_mode: 'pdb'
      })
    ).resolves.toBe('pdb')
    await expect(
      BilboMDClassicJobSchema.validateAt('bilbomd_mode', {
        bilbomd_mode: undefined
      })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - title', () => {
  it('accepts valid title', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: 'Good Job' })
    ).resolves.toBe('Good Job')
  })

  it('rejects title shorter than 4 characters', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: 'abc' })
    ).rejects.toThrow('at least 4 characters')
  })

  // Classic schema max is 24 characters (not 30 like other schemas)
  it('rejects title longer than 24 characters', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: 'a'.repeat(25) })
    ).rejects.toThrow('less than 24 characters')
  })

  it('accepts title of exactly 24 characters', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: 'a'.repeat(24) })
    ).resolves.toBe('a'.repeat(24))
  })

  it('rejects title with special characters', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: 'Bad@Job!' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing title', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('title', { title: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - num_conf', () => {
  it('accepts 1 through 4', async () => {
    for (const n of [1, 2, 3, 4]) {
      await expect(
        BilboMDClassicJobSchema.validateAt('num_conf', { num_conf: n })
      ).resolves.toBe(n)
    }
  })

  it('rejects 0, 5, and non-integer values', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('num_conf', { num_conf: 0 })
    ).rejects.toBeTruthy()
    await expect(
      BilboMDClassicJobSchema.validateAt('num_conf', { num_conf: 5 })
    ).rejects.toBeTruthy()
    await expect(
      BilboMDClassicJobSchema.validateAt('num_conf', { num_conf: 1.5 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing num_conf', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('num_conf', { num_conf: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - rg_min', () => {
  it('accepts values between 10 and 100', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: 10 })
    ).resolves.toBe(10)
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: 50 })
    ).resolves.toBe(50)
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: 100 })
    ).resolves.toBe(100)
  })

  it('rejects value below 10', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: 9 })
    ).rejects.toBeTruthy()
  })

  it('rejects value above 100', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg_min', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_min', { rg_min: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - rg_max', () => {
  it('accepts rg_max greater than rg_min', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 50 })
    ).resolves.toBe(50)
  })

  it('rejects rg_max equal to rg_min', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_max', { rg_min: 30, rg_max: 30 })
    ).rejects.toThrow('greater than Rg Minimum')
  })

  it('rejects rg_max less than rg_min', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_max', { rg_min: 50, rg_max: 20 })
    ).rejects.toThrow('greater than Rg Minimum')
  })

  it('rejects value above 100', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 101 })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDClassicJobSchema - conditional file fields', () => {
  const base = {
    bilbomd_mode: 'pdb',
    md_engine: 'charmm',
    title: 'Test Classic Job',
    dat_file: makeFile('data.dat'),
    inp_file: makeFile('const.inp'),
    num_conf: 2,
    rg_min: 20,
    rg_max: 50
  }

  it('requires pdb_file when bilbomd_mode is pdb', async () => {
    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: makeFile('model.pdb')
      })
    ).resolves.toBe(true)

    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: undefined
      })
    ).resolves.toBe(false)
  })

  it('requires psf_file and crd_file when bilbomd_mode is crd_psf', async () => {
    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'crd_psf',
        psf_file: makeFile('top.psf'),
        crd_file: makeFile('coords.crd')
      })
    ).resolves.toBe(true)

    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'crd_psf',
        psf_file: undefined,
        crd_file: makeFile('coords.crd')
      })
    ).resolves.toBe(false)

    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'crd_psf',
        psf_file: makeFile('top.psf'),
        crd_file: undefined
      })
    ).resolves.toBe(false)
  })

  it('does not require psf/crd when bilbomd_mode is pdb', async () => {
    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: makeFile('model.pdb'),
        psf_file: undefined,
        crd_file: undefined
      })
    ).resolves.toBe(true)
  })

  it('enforces dat_file extension and size', async () => {
    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: makeFile('model.pdb'),
        dat_file: makeFile('data.txt')
      })
    ).resolves.toBe(false)

    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: makeFile('model.pdb'),
        dat_file: makeFile('data.dat', 2_000_001)
      })
    ).resolves.toBe(false)
  })

  it('enforces inp_file extension', async () => {
    await expect(
      BilboMDClassicJobSchema.isValid({
        ...base,
        bilbomd_mode: 'pdb',
        pdb_file: makeFile('model.pdb'),
        inp_file: makeFile('const.txt')
      })
    ).resolves.toBe(false)
  })
})
