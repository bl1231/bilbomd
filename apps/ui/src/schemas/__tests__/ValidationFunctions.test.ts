import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  noSpaces,
  isSaxsData,
  isValidConstInpFile,
  hasAllowedResiduesOnly,
  isPsfData,
  isCRD,
  containsChainId,
  cifContainsChainId,
  cifHasAllowedResiduesOnly,
  noLeadingSpaceOnPDBLines
} from '../ValidationFunctions'

const makeFile = (name: string, content: string, type = 'text/plain') => {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  Object.defineProperty(file, 'size', { value: content.length })
  return file
}

describe('ValidationFunctions', () => {
  it('noSpaces detects spaces in filename', async () => {
    expect(await noSpaces(makeFile('no_spaces.dat', 'x'))).toBe(true)
    expect(await noSpaces(makeFile('has spaces.dat', 'x'))).toBe(false)
  })

  it('isSaxsData returns valid for plausible 3-column numeric data', async () => {
    const content = `# Q I(Q) Error\n9.37500000E-03 6.52879323E+01 9.99156442E+00\n9.88200000E-03 6.40240326E+01 8.65418671E+00\n`
    const result = await isSaxsData(makeFile('data.dat', content))
    expect(result.valid).toBe(true)
  })

  it('isSaxsData returns invalid for non-numeric content', async () => {
    const content = `this is not valid saxs data`
    const result = await isSaxsData(makeFile('bad.dat', content))
    expect(result.valid).toBe(false)
  })

  it('isValidConstInpFile returns true for valid const.inp (pdb mode)', async () => {
    const content = [
      '! BilboMD const.inp',
      'define segid PROA',
      'cons fix sele segid PROA end',
      'shape ellipsoid',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(
      makeFile('const.inp', content),
      'pdb'
    )
    expect(result).toBe(true)
  })

  it('hasAllowedResiduesOnly returns valid for standard residues', async () => {
    const content = `ATOM      1  N   MET A   1\nATOM      2  CA  MET A   1\nEND\n`
    const result = await hasAllowedResiduesOnly(makeFile('model.pdb', content))
    expect(result.valid).toBe(true)
  })

  it('hasAllowedResiduesOnly returns valid for common ions (MG, ZN)', async () => {
    const content = `HETATM    1 MG   MG  A   1\nHETATM    2 ZN   ZN  A   2\nEND\n`
    const result = await hasAllowedResiduesOnly(makeFile('model.pdb', content))
    expect(result.valid).toBe(true)
  })

  it('hasAllowedResiduesOnly returns invalid for truly unknown residues', async () => {
    const content = `ATOM      1  CA  UNK A   1\nEND\n`
    const result = await hasAllowedResiduesOnly(makeFile('model.pdb', content))
    expect(result.valid).toBe(false)
    expect(result.unsupportedResidues).toContain('UNK')
  })

  it('containsChainId detects presence of chain ID in column 22', async () => {
    const withChain = `ATOM      1  N   MET A   1\nEND\n`
    const noChain = `ATOM      1  N   MET     1\nEND\n`
    expect(await containsChainId(makeFile('with.pdb', withChain))).toBe(true)
    expect(await containsChainId(makeFile('no.pdb', noChain))).toBe(false)
  })

  it('noLeadingSpaceOnPDBLines fails when a line starts with a space', async () => {
    const good = `ATOM      1  N   MET A   1\nEND\n`
    const bad = ` ATOM      1  N   MET A   1\nEND\n`
    expect(await noLeadingSpaceOnPDBLines(makeFile('good.pdb', good))).toBe(
      true
    )
    expect(await noLeadingSpaceOnPDBLines(makeFile('bad.pdb', bad))).toBe(false)
  })

  it('isPsfData returns false for insufficient PSF content', async () => {
    const content = `PSF\n!NATOM\n`
    expect(await isPsfData(makeFile('top.psf', content))).toBe(false)
  })

  it('isPsfData returns true for example PSF', async () => {
    const content = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'example.psf'),
      'utf-8'
    )
    expect(await isPsfData(makeFile('example.psf', content))).toBe(true)
  })

  it('isPsfData fails when !NATOM count mismatches actual atom lines', async () => {
    const badContent = [
      'PSF EXT CMAP CHEQ XPLOR',
      '',
      '         3 !NTITLE',
      '* HEADER',
      '* SUBHEADER',
      '* DATE',
      '',
      '      3 !NATOM',
      '         1 PROA     1        MET      N        NH3     -0.300000       14.0070           0   0.00000     -0.301140E-02',
      '         2 PROA     1        MET      HT1      HC       0.330000       1.00800           0   0.00000     -0.301140E-02'
    ].join('\n')
    expect(await isPsfData(makeFile('bad.psf', badContent))).toBe(false)
  })

  it('isPsfData fails when !NTITLE is missing', async () => {
    const badContent = [
      'PSF EXT CMAP CHEQ XPLOR',
      '',
      '      2 !NATOM',
      '         1 PROA     1        MET      N        NH3     -0.300000       14.0070           0   0.00000     -0.301140E-02',
      '         2 PROA     1        MET      HT1      HC       0.330000       1.00800           0   0.00000     -0.301140E-02'
    ].join('\n')
    expect(await isPsfData(makeFile('missing-title.psf', badContent))).toBe(
      false
    )
  })

  it('isCRD returns false for insufficient CRD content', async () => {
    const content = `* CRD file\n*\n      1      1 PROA    MET  N    1.0  2.0  3.0\n`
    expect(await isCRD(makeFile('coords.crd', content))).toBe(false)
  })

  it('isCRD returns true for example CRD header', async () => {
    const content = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'example.crd'),
      'utf-8'
    )
    expect(await isCRD(makeFile('example.crd', content))).toBe(true)
  })

  it('isCRD fails when too many * header lines precede EXT', async () => {
    const badContent = [
      '* a',
      '* b',
      '* c',
      '* d',
      '* e',
      '* f',
      '* g',
      '      10  EXT'
    ].join('\n')
    expect(await isCRD(makeFile('too-many-stars.crd', badContent))).toBe(
      false
    )
  })

  it('isCRD fails when EXT is missing after header', async () => {
    const badContent = ['* a', '* b', '* c', '* d'].join('\n')
    expect(await isCRD(makeFile('no-ext.crd', badContent))).toBe(false)
  })
})

// Minimal valid _atom_site loop used across CIF tests
const MINIMAL_CIF = [
  'data_test',
  'loop_',
  '_atom_site.group_PDB',
  '_atom_site.id',
  '_atom_site.label_comp_id',
  '_atom_site.label_asym_id',
  '_atom_site.auth_asym_id',
  '_atom_site.auth_seq_id',
  '_atom_site.Cartn_x',
  '_atom_site.Cartn_y',
  '_atom_site.Cartn_z',
  'ATOM 1 ASN A A 1 12.3 4.5 6.7',
  'ATOM 2 GLY A A 2 13.3 5.5 7.7',
  '#'
].join('\n')

describe('cifContainsChainId', () => {
  it('returns true for a CIF file with a valid auth_asym_id', async () => {
    expect(await cifContainsChainId(makeFile('model.cif', MINIMAL_CIF))).toBe(
      true
    )
  })

  it('returns false when auth_asym_id column is missing', async () => {
    const noChainCif = [
      'data_test',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.id',
      '_atom_site.label_comp_id',
      'ATOM 1 ASN',
      '#'
    ].join('\n')
    expect(
      await cifContainsChainId(makeFile('nochain.cif', noChainCif))
    ).toBe(false)
  })

  it('returns false for a non-CIF file', async () => {
    const notCif = 'ATOM      1  N   MET A   1\nEND\n'
    expect(await cifContainsChainId(makeFile('model.cif', notCif))).toBe(false)
  })
})

describe('cifHasAllowedResiduesOnly', () => {
  it('returns valid for a CIF with only standard amino acids', async () => {
    const result = await cifHasAllowedResiduesOnly(
      makeFile('model.cif', MINIMAL_CIF)
    )
    expect(result.valid).toBe(true)
    expect(result.unsupportedResidues).toHaveLength(0)
  })

  it('returns invalid for a CIF with an unknown residue', async () => {
    const badCif = [
      'data_test',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.id',
      '_atom_site.label_comp_id',
      '_atom_site.auth_asym_id',
      'ATOM 1 UNK A',
      '#'
    ].join('\n')
    const result = await cifHasAllowedResiduesOnly(
      makeFile('bad.cif', badCif)
    )
    expect(result.valid).toBe(false)
    expect(result.unsupportedResidues).toContain('UNK')
  })

  it('returns invalid when no _atom_site block is found', async () => {
    const empty = 'data_test\n#\n'
    const result = await cifHasAllowedResiduesOnly(
      makeFile('empty.cif', empty)
    )
    expect(result.valid).toBe(false)
  })
})
