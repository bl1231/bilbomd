import { describe, it, expect } from 'vitest'
import { mixed, object, string } from 'yup'
import { openmmConstInpCheck } from '../fieldTests'

const schema = object({
  md_engine: string(),
  inp_file: mixed().concat(openmmConstInpCheck())
})

const file = (text: string) => new File([text], 'const.inp')

const check = (text: string, md_engine: string) =>
  schema.validate({ md_engine, inp_file: file(text) }).then(
    () => true,
    (e: Error) => e.message
  )

const READABLE = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
cons fix sele fixed1 end
return`

const WHOLE_SEGMENT = `define fixed1 sele ( resid 2:344 .and. segid PROA ) end
define fixed2 sele ( segid CARB ) end
cons fix sele fixed1 .or. fixed2 end
return`

describe('openmmConstInpCheck', () => {
  it('accepts a file OpenMM reads in full', async () => {
    expect(await check(READABLE, 'openmm')).toBe(true)
  })

  it('rejects lines OpenMM would ignore, for OpenMM jobs', async () => {
    const result = await check(WHOLE_SEGMENT, 'openmm')
    expect(result).toContain('OpenMM would ignore these lines')
    expect(result).toContain('"define fixed2 sele ( segid CARB ) end"')
  })

  it('leaves CHARMM jobs alone', async () => {
    expect(await check(WHOLE_SEGMENT, 'charmm')).toBe(true)
  })

  it('skips a value that is not a picked file', async () => {
    await expect(
      schema.validate({ md_engine: 'openmm', inp_file: 'const.inp' })
    ).resolves.toBeTruthy()
  })
})
