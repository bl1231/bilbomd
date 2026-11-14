import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every route that takes a const.inp rejects overlapping bodies in its upload
// schema, before a job is created. The real validators run; only reading the
// upload is mocked.
vi.mock('fs/promises', () => ({ default: { readFile: vi.fn() } }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs/promises'
import { pdbJobSchema } from '../pdbJobSchema.js'
import { crdJobSchema } from '../crdJobSchema.js'
import { sansJobSchema } from '../sansJobSchema.js'

const upload = {
  originalname: 'const.inp',
  path: '/uploads/const.inp',
  size: 100
}

// Fixed and rigid share residues 45-50, with the fixed one in a form
// parseConstInp doesn't read (segid before resid)
const FIXED_RIGID_OVERLAP = `define fixed1 sele ( segid PROA .and. resid 1:50 ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 45:80 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
return`

const NO_OVERLAP = `define fixed1 sele ( resid 1:50 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 53:80 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
return`

const check = async (
  schema: typeof pdbJobSchema | typeof crdJobSchema | typeof sansJobSchema,
  field: string,
  text: string
) => {
  vi.mocked(fs.readFile).mockResolvedValue(text as never)
  return schema.validateAt(field, { [field]: upload }).then(
    () => true,
    (e: Error) => e.message
  )
}

beforeEach(() => vi.clearAllMocks())

describe.each([
  ['Classic PDB', pdbJobSchema, 'const_inp_file'],
  ['Classic CRD/PSF', crdJobSchema, 'const_inp_file'],
  ['SANS', sansJobSchema, 'inp_file']
] as const)('%s const.inp overlaps', (_, schema, field) => {
  it('rejects a fixed body that overlaps a rigid one', async () => {
    expect(await check(schema, field, FIXED_RIGID_OVERLAP)).toBe(
      'Constraint bodies must not overlap: FixedBody1 and RigidBody1 both ' +
        'include segid PROA residues 45-50. A residue is either held in place ' +
        '(fixed) or moves with one rigid body. Remove the shared residues ' +
        'from one of them.'
    )
  })

  it('accepts bodies that do not overlap', async () => {
    expect(await check(schema, field, NO_OVERLAP)).toBe(true)
  })
})
