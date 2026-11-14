import { describe, it, expect, vi, beforeEach } from 'vitest'

// OpenMM jobs reject a const.inp whose constraints would not all reach
// OpenMM. The real validators run; only reading the upload is mocked.
vi.mock('fs/promises', () => ({ default: { readFile: vi.fn() } }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs/promises'
import { pdbJobSchema } from '../pdbJobSchema.js'
import { sansJobSchema } from '../sansJobSchema.js'

const upload = {
  originalname: 'const.inp',
  path: '/uploads/const.inp',
  size: 100
}

const READABLE = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
cons fix sele fixed1 end
return`

// Glycan chains selected by segid only: OpenMM's conversion skips them
const WHOLE_SEGMENTS = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
define fixed2 sele ( segid CARB .or. segid CARC ) end
cons fix sele fixed1 .or. fixed2 end
return`

// A single fixed residue: OpenMM's fixed ranges include both ends (#1101)
const SINGLE_FIXED = `define fixed1 sele ( resid 7:7 .and. segid RNAB ) end
cons fix sele fixed1 end
return`

const schemas = [
  ['Classic PDB', pdbJobSchema, 'const_inp_file'],
  ['SANS', sansJobSchema, 'inp_file']
] as const

const check = async (
  schema: (typeof schemas)[number][1],
  field: string,
  text: string,
  md_engine: string
) => {
  vi.mocked(fs.readFile).mockResolvedValue(text as never)
  return schema.validateAt(field, { [field]: upload, md_engine }).then(
    () => true,
    (e: Error) => e.message
  )
}

beforeEach(() => vi.clearAllMocks())

describe.each(schemas)('%s const.inp for OpenMM', (_, schema, field) => {
  it('accepts a file OpenMM reads in full', async () => {
    expect(await check(schema, field, READABLE, 'OpenMM')).toBe(true)
  })

  it('rejects selections OpenMM would skip, naming them', async () => {
    const result = await check(schema, field, WHOLE_SEGMENTS, 'OpenMM')
    expect(result).toContain('OpenMM would ignore these lines')
    expect(result).toContain(
      '"define fixed2 sele ( segid CARB .or. segid CARC ) end"'
    )
  })

  it('accepts a single fixed residue', async () => {
    expect(await check(schema, field, SINGLE_FIXED, 'OpenMM')).toBe(true)
  })

  it('leaves CHARMM jobs alone, since CHARMM reads the file itself', async () => {
    expect(await check(schema, field, WHOLE_SEGMENTS, 'CHARMM')).toBe(true)
  })
})
