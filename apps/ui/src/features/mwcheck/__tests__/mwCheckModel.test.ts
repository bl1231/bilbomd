import { describe, it, expect } from 'vitest'
import { mwCheckRequest } from '../mwCheckModel'

const dat = new File(['0.01 1 0.1\n'], 'saxs.dat', { lastModified: 1 })
const pdb = new File(['ATOM\n'], 'model.pdb', { lastModified: 2 })
const psf = new File(['PSF\n'], 'model.psf', { lastModified: 3 })
const entity = { type: 'Protein', sequence: 'MKT', copies: 1 }

const fields = (formData: FormData) =>
  Object.fromEntries(
    [...formData.entries()].map(([name, value]) => [
      name,
      value instanceof File ? value.name : value
    ])
  )

describe('mwCheckRequest', () => {
  it('needs both a SAXS file and a model', () => {
    expect(mwCheckRequest({ datFile: dat })).toBeUndefined()
    expect(mwCheckRequest({ datFile: '', pdbFile: pdb })).toBeUndefined()
    // Example data and resubmitted jobs leave a file name, not a File
    expect(
      mwCheckRequest({ datFile: 'example-saxs.dat', pdbFile: 'example.pdb' })
    ).toBeUndefined()
    expect(mwCheckRequest({ datFile: dat, pdbFile: '' })).toBeUndefined()
  })

  it('sends a PDB with the SAXS file and its units', () => {
    const request = mwCheckRequest({ datFile: dat, qUnits: 'nm', pdbFile: pdb })
    expect(fields(request!.build())).toEqual({
      dat_file: 'saxs.dat',
      q_units: 'nm',
      pdb_file: 'model.pdb'
    })
  })

  it('sends a PSF when there is no PDB', () => {
    const request = mwCheckRequest({ datFile: dat, psfFile: psf, pdbFile: '' })
    expect(fields(request!.build())).toEqual({
      dat_file: 'saxs.dat',
      q_units: 'auto',
      psf_file: 'model.psf'
    })
  })

  it('sends tidied sequences, without the form-only fields', () => {
    const request = mwCheckRequest({
      datFile: dat,
      entities: [
        { ...entity, sequence: 'mk t\nay', copies: '2' },
        { type: 'DNA', sequence: 'ACGT', copies: 1 }
      ]
    })
    expect(JSON.parse(fields(request!.build()).entities as string)).toEqual([
      { type: 'Protein', sequence: 'MKTAY', copies: 2 },
      { type: 'DNA', sequence: 'ACGT', copies: 1 }
    ])
  })

  it('waits until every molecule is filled in', () => {
    const incomplete = [entity, { ...entity, sequence: '' }]
    expect(
      mwCheckRequest({ datFile: dat, entities: incomplete })
    ).toBeUndefined()
    expect(mwCheckRequest({ datFile: dat, entities: [] })).toBeUndefined()
    expect(
      mwCheckRequest({
        datFile: dat,
        entities: [{ ...entity, sequence: 'MK1' }]
      })
    ).toBeUndefined()
    expect(
      mwCheckRequest({ datFile: dat, entities: [{ ...entity, copies: 0 }] })
    ).toBeUndefined()
    expect(
      mwCheckRequest({ datFile: dat, entities: [{ ...entity, type: 'Lipid' }] })
    ).toBeUndefined()
  })

  it('changes its key only when the request would change', () => {
    const key = (inputs: Parameters<typeof mwCheckRequest>[0]) =>
      mwCheckRequest(inputs)!.key
    const base = { datFile: dat, pdbFile: pdb }

    expect(key(base)).toBe(key({ ...base }))
    expect(key(base)).not.toBe(key({ ...base, qUnits: 'nm' }))
    expect(key(base)).not.toBe(
      key({ ...base, pdbFile: new File(['ATOM\n'], 'other.pdb') })
    )
    // A new array with the same sequences is the same request
    expect(key({ datFile: dat, entities: [{ ...entity }] })).toBe(
      key({ datFile: dat, entities: [{ ...entity, sequence: ' mkt ' }] })
    )
    expect(key({ datFile: dat, entities: [entity] })).not.toBe(
      key({ datFile: dat, entities: [{ ...entity, sequence: 'MKTA' }] })
    )
  })

  it('waits longer for typed sequences than for chosen files', () => {
    const file = mwCheckRequest({ datFile: dat, pdbFile: pdb })!
    const typed = mwCheckRequest({ datFile: dat, entities: [entity] })!
    expect(typed.delayMs).toBeGreaterThan(file.delayMs)
  })
})
