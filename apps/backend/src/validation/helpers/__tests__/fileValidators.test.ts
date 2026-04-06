import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Express } from 'express'
import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  psfCheck,
  crdCheck,
  chainIdCheck,
  constInpCheck,
  jsonFileCheck
} from '../fileValidators.js'

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../validationFunctions.js', () => ({
  isSaxsData: vi.fn(),
  isCRD: vi.fn(),
  isPsfData: vi.fn(),
  isValidConstInpFile: vi.fn(),
  containsChainId: vi.fn()
}))

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() }
}))

import * as validationFunctions from '../validationFunctions.js'
import fs from 'fs/promises'

const multerFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    originalname: 'test.dat',
    path: '/tmp/test.dat',
    size: 1000,
    ...overrides
  }) as Express.Multer.File

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// requiredFile
// ---------------------------------------------------------------------------
describe('requiredFile', () => {
  it('passes when value is an object', async () => {
    const schema = yup.object({ file: requiredFile('File required') })
    await expect(schema.validate({ file: multerFile() })).resolves.toBeDefined()
  })

  it('fails when value is undefined', async () => {
    const schema = yup.object({ file: requiredFile('File required') })
    await expect(schema.validate({ file: undefined })).rejects.toThrow('File required')
  })
})

// ---------------------------------------------------------------------------
// fileExtTest
// ---------------------------------------------------------------------------
describe('fileExtTest', () => {
  it('passes when extension matches', async () => {
    const schema = yup.object({ file: fileExtTest('pdb') })
    await expect(schema.validate({ file: multerFile({ originalname: 'model.pdb' }) })).resolves.toBeDefined()
  })

  it('passes for uppercase extension', async () => {
    const schema = yup.object({ file: fileExtTest('pdb') })
    await expect(schema.validate({ file: multerFile({ originalname: 'model.PDB' }) })).resolves.toBeDefined()
  })

  it('fails when extension does not match', async () => {
    const schema = yup.object({ file: fileExtTest('pdb') })
    await expect(schema.validate({ file: multerFile({ originalname: 'model.txt' }) })).rejects.toThrow(
      'Only accepts a *.pdb file.'
    )
  })
})

// ---------------------------------------------------------------------------
// fileSizeTest
// ---------------------------------------------------------------------------
describe('fileSizeTest', () => {
  it('passes when file size is within limit', async () => {
    const schema = yup.object({ file: fileSizeTest(5_000_000) })
    await expect(schema.validate({ file: multerFile({ size: 1_000_000 }) })).resolves.toBeDefined()
  })

  it('passes when file size equals limit exactly', async () => {
    const schema = yup.object({ file: fileSizeTest(5_000_000) })
    await expect(schema.validate({ file: multerFile({ size: 5_000_000 }) })).resolves.toBeDefined()
  })

  it('fails when file size exceeds limit', async () => {
    const schema = yup.object({ file: fileSizeTest(5_000_000) })
    await expect(schema.validate({ file: multerFile({ size: 6_000_000 }) })).rejects.toThrow('5MB')
  })
})

// ---------------------------------------------------------------------------
// fileNameLengthTest
// ---------------------------------------------------------------------------
describe('fileNameLengthTest', () => {
  it('passes for filename <= 30 chars', async () => {
    const schema = yup.object({ file: fileNameLengthTest() })
    await expect(schema.validate({ file: multerFile({ originalname: 'short.pdb' }) })).resolves.toBeDefined()
  })

  it('passes for exactly 30 char filename', async () => {
    const schema = yup.object({ file: fileNameLengthTest() })
    const name = 'a'.repeat(26) + '.pdb' // 30 chars
    await expect(schema.validate({ file: multerFile({ originalname: name }) })).resolves.toBeDefined()
  })

  it('fails for filename > 30 chars', async () => {
    const schema = yup.object({ file: fileNameLengthTest() })
    const name = 'a'.repeat(27) + '.pdb' // 31 chars
    await expect(schema.validate({ file: multerFile({ originalname: name }) })).rejects.toThrow('30 characters')
  })
})

// ---------------------------------------------------------------------------
// noSpacesTest
// ---------------------------------------------------------------------------
describe('noSpacesTest', () => {
  it('passes when filename has no spaces', async () => {
    const schema = yup.object({ file: noSpacesTest() })
    await expect(schema.validate({ file: multerFile({ originalname: 'nospaces.pdb' }) })).resolves.toBeDefined()
  })

  it('fails when filename contains a space', async () => {
    const schema = yup.object({ file: noSpacesTest() })
    await expect(schema.validate({ file: multerFile({ originalname: 'has space.pdb' }) })).rejects.toThrow(
      'No spaces'
    )
  })
})

// ---------------------------------------------------------------------------
// saxsCheck
// ---------------------------------------------------------------------------
describe('saxsCheck', () => {
  it('passes when isSaxsData returns valid', async () => {
    vi.mocked(validationFunctions.isSaxsData).mockResolvedValue({ valid: true })
    const schema = yup.object({ file: saxsCheck() })
    await expect(schema.validate({ file: multerFile() })).resolves.toBeDefined()
  })

  it('fails with message when isSaxsData returns invalid', async () => {
    vi.mocked(validationFunctions.isSaxsData).mockResolvedValue({
      valid: false,
      message: 'Not enough SAXS lines'
    })
    const schema = yup.object({ file: saxsCheck() })
    await expect(schema.validate({ file: multerFile() })).rejects.toThrow('Not enough SAXS lines')
  })

  it('fails when file has no path', async () => {
    const schema = yup.object({ file: saxsCheck() })
    const file = multerFile({ path: undefined as never })
    await expect(schema.validate({ file })).rejects.toThrow('Missing SAXS file path')
  })
})

// ---------------------------------------------------------------------------
// psfCheck
// ---------------------------------------------------------------------------
describe('psfCheck', () => {
  it('passes when isPsfData returns true', async () => {
    vi.mocked(validationFunctions.isPsfData).mockResolvedValue(true)
    const schema = yup.object({ file: psfCheck() })
    await expect(schema.validate({ file: multerFile() })).resolves.toBeDefined()
  })

  it('fails when isPsfData returns false', async () => {
    vi.mocked(validationFunctions.isPsfData).mockResolvedValue(false)
    const schema = yup.object({ file: psfCheck() })
    await expect(schema.validate({ file: multerFile() })).rejects.toThrow('valid PSF')
  })

  it('passes (skips check) when file has no path', async () => {
    const schema = yup.object({ file: psfCheck() })
    await expect(schema.validate({ file: multerFile({ path: undefined as never }) })).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// crdCheck
// ---------------------------------------------------------------------------
describe('crdCheck', () => {
  it('passes when isCRD returns true', async () => {
    vi.mocked(validationFunctions.isCRD).mockResolvedValue(true)
    const schema = yup.object({ file: crdCheck() })
    await expect(schema.validate({ file: multerFile() })).resolves.toBeDefined()
  })

  it('fails when isCRD returns false', async () => {
    vi.mocked(validationFunctions.isCRD).mockResolvedValue(false)
    const schema = yup.object({ file: crdCheck() })
    await expect(schema.validate({ file: multerFile() })).rejects.toThrow('valid CRD')
  })
})

// ---------------------------------------------------------------------------
// chainIdCheck
// ---------------------------------------------------------------------------
describe('chainIdCheck', () => {
  it('passes when containsChainId returns true', async () => {
    vi.mocked(validationFunctions.containsChainId).mockResolvedValue(true)
    const schema = yup.object({ file: chainIdCheck() })
    await expect(schema.validate({ file: multerFile() })).resolves.toBeDefined()
  })

  it('fails when containsChainId returns false', async () => {
    vi.mocked(validationFunctions.containsChainId).mockResolvedValue(false)
    const schema = yup.object({ file: chainIdCheck() })
    await expect(schema.validate({ file: multerFile() })).rejects.toThrow('Chain ID')
  })
})

// ---------------------------------------------------------------------------
// constInpCheck
// ---------------------------------------------------------------------------
describe('constInpCheck', () => {
  it('passes when isValidConstInpFile returns true', async () => {
    vi.mocked(validationFunctions.isValidConstInpFile).mockResolvedValue(true)
    const schema = yup.object({ file: constInpCheck() })
    const ctx = { context: { bilbomd_mode: 'pdb' } }
    await expect(schema.validate({ file: multerFile() }, ctx)).resolves.toBeDefined()
  })

  it('fails with message when isValidConstInpFile returns an error string', async () => {
    vi.mocked(validationFunctions.isValidConstInpFile).mockResolvedValue('Missing define line')
    const schema = yup.object({ file: constInpCheck() })
    const ctx = { context: { bilbomd_mode: 'pdb' } }
    await expect(schema.validate({ file: multerFile() }, ctx)).rejects.toThrow('Missing define line')
  })
})

// ---------------------------------------------------------------------------
// jsonFileCheck
// ---------------------------------------------------------------------------
describe('jsonFileCheck', () => {
  it('passes for valid JSON file content', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{"key": "value"}' as never)
    const schema = yup.object({ file: jsonFileCheck() })
    await expect(schema.validate({ file: multerFile({ originalname: 'data.json' }) })).resolves.toBeDefined()
  })

  it('fails for invalid JSON content', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not json {{' as never)
    const schema = yup.object({ file: jsonFileCheck() })
    await expect(schema.validate({ file: multerFile({ originalname: 'data.json' }) })).rejects.toThrow('JSON')
  })

  it('passes (skips check) when file has no path', async () => {
    const schema = yup.object({ file: jsonFileCheck() })
    await expect(schema.validate({ file: multerFile({ path: undefined as never }) })).resolves.toBeDefined()
  })
})
