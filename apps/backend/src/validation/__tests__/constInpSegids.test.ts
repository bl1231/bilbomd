import { describe, it, expect, vi, beforeEach } from 'vitest'

// Each job schema applies its own segment ID rule to the constraint file. The
// real validators run; only reading the upload is mocked.
vi.mock('fs/promises', () => ({ default: { readFile: vi.fn() } }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs/promises'
import { pdbJobSchema } from '../pdbJobSchema.js'
import { crdJobSchema } from '../crdJobSchema.js'
import { sansJobSchema } from '../sansJobSchema.js'

const constInp = (segid: string) =>
  [
    `define fixed1 sele ( resid 1:20 .and. segid ${segid} ) end`,
    'cons fix sele fixed1 end',
    'return'
  ].join('\n')

const upload = {
  originalname: 'const.inp',
  path: '/uploads/const.inp',
  size: 100
}

const check = async (
  schema: typeof pdbJobSchema | typeof crdJobSchema | typeof sansJobSchema,
  field: string,
  segid: string
) => {
  vi.mocked(fs.readFile).mockResolvedValue(constInp(segid) as never)
  return schema.validateAt(field, { [field]: upload }).then(
    () => true,
    (e: Error) => e.message
  )
}

const PDB_RULE = 'segid must be: PRO[A-Z], DNA[A-Z], RNA[A-Z], etc.'
const CRD_RULE = 'segid must contain 4 uppercase letters [A-Z]'

beforeEach(() => vi.clearAllMocks())

describe('constraint file segment IDs', () => {
  it.each([
    ['Classic PDB', pdbJobSchema, 'const_inp_file'],
    ['SANS', sansJobSchema, 'inp_file']
  ] as const)('%s jobs use the PDB rule', async (_, schema, field) => {
    expect(await check(schema, field, 'PROA')).toBe(true)
    expect(await check(schema, field, 'DNAB')).toBe(true)
    expect(await check(schema, field, 'ABCD')).toBe(PDB_RULE)
    expect(await check(schema, field, 'A')).toBe(PDB_RULE)
  })

  it('Classic CRD/PSF jobs need four uppercase letters', async () => {
    expect(await check(crdJobSchema, 'const_inp_file', 'ABCD')).toBe(true)
    expect(await check(crdJobSchema, 'const_inp_file', 'PROA')).toBe(true)
    expect(await check(crdJobSchema, 'const_inp_file', 'abc')).toBe(CRD_RULE)
  })
})
