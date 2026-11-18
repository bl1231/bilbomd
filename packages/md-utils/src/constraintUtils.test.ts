import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  convertInpToYaml,
  validateYamlConstraints,
  extractConstraintsFromYaml,
  buildChainMolTypes,
  buildChainMolTypesFromInp,
  assertNoRigidBodyOverlaps
} from './constraintUtils.js'
import type { IMDConstraints } from '@bilbomd/mongodb-schema'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'

// Test data based on your examples
const testInpContent = `define fixed1 sele ( resid 1:639 .and. segid PROA ) end
define fixed2 sele ( resid 9:236 .and. segid PROB ) end
define fixed3 sele ( resid 540:770 .and. segid PROB ) end
cons fix sele fixed1 .or. fixed2 .or. fixed3 end
 
define rigid1 sele ( resid 774:910 .and. segid PROB ) end
shape desc dock1 rigid sele rigid1 end
 
define rigid2 sele ( resid 1:65 .and. segid PROC ) end
define rigid3 sele ( resid 241:535 .and. segid PROB ) end
shape desc dock2 rigid sele rigid2 .or. rigid3 end
 
return`

const testYamlContent = `fixed_bodies:
  - name: FixedBody1
    segments:
      - chain_id: A
        residues:
          start: 1
          stop: 639
      - chain_id: B
        residues:
          start: 9
          stop: 236
      - chain_id: B
        residues:
          start: 540
          stop: 770
rigid_bodies:
  - name: RigidBody1
    segments:
      - chain_id: B
        residues:
          start: 774
          stop: 910
  - name: RigidBody2
    segments:
      - chain_id: C
        residues:
          start: 1
          stop: 65
      - chain_id: B
        residues:
          start: 241
          stop: 535`

let tempDir: string

beforeAll(async () => {
  tempDir = path.join('/tmp', `constraint-test-${uuid()}`)
  await fs.ensureDir(tempDir)
})

afterAll(async () => {
  await fs.remove(tempDir)
})

describe('Constraint Utils', () => {
  describe('INP to YAML conversion', () => {
    test('should convert CHARMM INP to OpenMM YAML format', async () => {
      expect.assertions(4)

      const inpPath = path.join(tempDir, 'test.inp')
      await fs.writeFile(inpPath, testInpContent)

      const yamlResult = await convertInpToYaml(inpPath)

      expect(yamlResult).toBeDefined()
      expect(yamlResult).toContain('fixed_bodies:')
      expect(yamlResult).toContain('rigid_bodies:')
      expect(yamlResult).toContain('chain_id:')
    })

    test('should correctly map CHARMM segments to chain IDs', async () => {
      expect.assertions(3)

      const inpPath = path.join(tempDir, 'segment-test.inp')
      await fs.writeFile(inpPath, testInpContent)

      const yamlResult = await convertInpToYaml(inpPath)

      expect(yamlResult).toContain('chain_id: A') // PROA -> A
      expect(yamlResult).toContain('chain_id: B') // PROB -> B
      expect(yamlResult).toContain('chain_id: C') // PROC -> C
    })

    test('should handle residue ranges correctly', async () => {
      expect.assertions(2)

      const inpPath = path.join(tempDir, 'residue-test.inp')
      await fs.writeFile(inpPath, testInpContent)

      const yamlResult = await convertInpToYaml(inpPath)

      expect(yamlResult).toContain('start: 1')
      expect(yamlResult).toContain('stop: 639')
    })
  })

  describe('Validation', () => {
    test('should validate valid YAML files', async () => {
      expect.assertions(1)

      const yamlPath = path.join(tempDir, 'valid.yaml')
      await fs.writeFile(yamlPath, testYamlContent)

      await expect(validateYamlConstraints(yamlPath)).resolves.toBeUndefined()
    })

    test('should reject invalid YAML structure', async () => {
      expect.assertions(1)

      const yamlPath = path.join(tempDir, 'invalid.yaml')
      await fs.writeFile(yamlPath, 'invalid: yaml: structure:')

      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow()
    })

    test('should reject YAML without constraints section', async () => {
      expect.assertions(1)

      const yamlPath = path.join(tempDir, 'no-constraints.yaml')
      await fs.writeFile(yamlPath, 'some_other_field: value')

      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'No constraint bodies found'
      )
    })
  })

  describe('extractConstraintsFromYaml', () => {
    test('parses unwrapped format', () => {
      const result = extractConstraintsFromYaml(testYamlContent)
      expect(result.fixed_bodies).toHaveLength(1)
      expect(result.rigid_bodies).toHaveLength(2)
    })

    test('parses wrapped format with constraints key', () => {
      const wrapped =
        'constraints:\n' +
        testYamlContent
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      const result = extractConstraintsFromYaml(wrapped)
      expect(result.fixed_bodies).toHaveLength(1)
    })

    test('throws on non-object YAML', () => {
      expect(() => extractConstraintsFromYaml('42')).toThrow(
        'Invalid YAML format'
      )
    })
  })

  describe('buildChainMolTypes', () => {
    const makePdbLine = (record: string, resName: string, chainId: string) =>
      record.padEnd(6) + '    1  CA  ' + resName.padEnd(3) + ' ' + chainId

    test('returns one entry per recognized chain', async () => {
      const pdbPath = path.join(tempDir, 'complex.pdb')
      const content = [
        makePdbLine('ATOM', 'ALA', 'A'),
        makePdbLine('ATOM', 'GLY', 'A'),
        makePdbLine('ATOM', 'DA', 'D'),
        makePdbLine('ATOM', 'A', 'R'),
        makePdbLine('HETATM', 'NAG', 'G'),
        makePdbLine('ATOM', 'XYZ', 'X')
      ].join('\n')
      await fs.writeFile(pdbPath, content)
      expect(await buildChainMolTypes(pdbPath)).toEqual([
        { chain_id: 'A', mol_type: 'PRO' },
        { chain_id: 'D', mol_type: 'DNA' },
        { chain_id: 'R', mol_type: 'RNA' },
        { chain_id: 'G', mol_type: 'CAR' }
      ])
    })
  })

  describe('buildChainMolTypesFromInp', () => {
    test('reads molecule types from pdb2crd-style segids', async () => {
      const inpPath = path.join(tempDir, 'mol-types.inp')
      await fs.writeFile(
        inpPath,
        [
          '! define ignored sele ( resid 1:5 .and. segid RNAZ ) end',
          'define fixed1 sele ( resid 1:639 .and. segid PROA ) end',
          'define fixed2 sele ( resid 9:236 .and. segid PROA ) end',
          'define fixed3 sele ( resid 1:20 .and. segid DNAD ) end',
          'define fixed4 sele ( resid 1:4 .and. segid CALg ) end',
          'cons fix sele fixed1 .or. fixed2 .or. fixed3 .or. fixed4 end',
          'return'
        ].join('\n')
      )
      expect(await buildChainMolTypesFromInp(inpPath)).toEqual([
        { chain_id: 'A', mol_type: 'PRO' },
        { chain_id: 'D', mol_type: 'DNA' },
        { chain_id: 'g', mol_type: 'CAR' }
      ])
    })

    test('leaves out segids without a known prefix', async () => {
      const inpPath = path.join(tempDir, 'custom-segid.inp')
      await fs.writeFile(
        inpPath,
        'define fixed1 sele ( resid 1:10 .and. segid HEAV ) end\ncons fix sele fixed1 end\nreturn\n'
      )
      expect(await buildChainMolTypesFromInp(inpPath)).toEqual([])
    })
  })

  describe('validateYamlConstraints additional paths', () => {
    test('validates wrapped YAML with constraints key', async () => {
      const wrapped =
        'constraints:\n' +
        testYamlContent
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      const yamlPath = path.join(tempDir, 'wrapped-valid.yaml')
      await fs.writeFile(yamlPath, wrapped)
      await expect(validateYamlConstraints(yamlPath)).resolves.toBeUndefined()
    })

    test('rejects fixed_bodies that is not an array', async () => {
      const yamlPath = path.join(tempDir, 'not-array.yaml')
      await fs.writeFile(yamlPath, 'fixed_bodies: "not an array"\n')
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'fixed_bodies must be an array'
      )
    })

    test('rejects body without name', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - segments:',
        '      - chain_id: A',
        '        residues:',
        '          start: 1',
        '          stop: 100'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'no-name.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Each fixed_bodies entry must have a valid name'
      )
    })

    test('rejects body with non-array segments', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - name: Body1',
        '    segments: "not an array"'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'bad-segments.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Each fixed_bodies entry must have a segments array'
      )
    })

    test('rejects segment without chain_id', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - name: Body1',
        '    segments:',
        '      - residues:',
        '          start: 1',
        '          stop: 100'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'no-chain.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Each segment must have a valid chain_id'
      )
    })

    test('rejects segment without residues', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - name: Body1',
        '    segments:',
        '      - chain_id: A'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'no-residues.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Each segment must have a residues object'
      )
    })

    test('rejects segment with non-numeric residue bounds', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - name: Body1',
        '    segments:',
        '      - chain_id: A',
        '        residues:',
        '          start: "abc"',
        '          stop: 100'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'non-numeric.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Residues must have numeric start and stop values'
      )
    })

    test('rejects segment with start greater than stop', async () => {
      const yaml = [
        'fixed_bodies:',
        '  - name: Body1',
        '    segments:',
        '      - chain_id: A',
        '        residues:',
        '          start: 100',
        '          stop: 1'
      ].join('\n')
      const yamlPath = path.join(tempDir, 'start-gt-stop.yaml')
      await fs.writeFile(yamlPath, yaml)
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Residue start must be less than or equal to stop'
      )
    })
  })

  describe('error paths', () => {
    test('convertInpToYaml throws on missing file', async () => {
      await expect(convertInpToYaml('/nonexistent/file.inp')).rejects.toThrow(
        'Failed to convert INP to YAML'
      )
    })

    test('validateYamlConstraints throws on non-object YAML', async () => {
      const yamlPath = path.join(tempDir, 'number.yaml')
      await fs.writeFile(yamlPath, '42\n')
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Invalid YAML constraint format'
      )
    })
  })

  describe('segidToChainId fallback', () => {
    test('convertInpToYaml returns raw segid when no prefix matches', async () => {
      const inpPath = path.join(tempDir, 'unknown-segid.inp')
      await fs.writeFile(
        inpPath,
        [
          'define fixed1 sele ( resid 1:100 .and. segid MYID ) end',
          'cons fix sele fixed1 end',
          'return'
        ].join('\n')
      )
      const result = await convertInpToYaml(inpPath)
      expect(result).toContain('chain_id: MYID')
    })
  })

  describe('define names reused later in the file (#1281)', () => {
    // Valid CHARMM: 'rigid1' is redefined after dock1 has used it, so dock1 is
    // chain A and dock2 is chains C + D.
    const reusedNameInp = [
      'define fixed1 sele ( resid 1:238 .and. segid PROB ) end',
      'cons fix sele fixed1 end ',
      '',
      'define rigid1 sele ( resid 1:238 .and. segid PROA ) end',
      'shape desc dock1 rigid sele rigid1 end ',
      '',
      'define rigid1 sele ( resid 1:26 .and. segid DNAC ) end',
      'define rigid2 sele ( resid 1:26 .and. segid DNAD ) end',
      'shape desc dock2 rigid sele rigid1 .or. rigid2 end ',
      '',
      'return',
      ''
    ].join('\n')

    test('each command uses the definitions current at its line', async () => {
      const inpPath = path.join(tempDir, 'reused-define.inp')
      await fs.writeFile(inpPath, reusedNameInp)

      const constraints = extractConstraintsFromYaml(
        await convertInpToYaml(inpPath)
      )

      expect(constraints).toEqual({
        fixed_bodies: [
          {
            name: 'FixedBody1',
            segments: [{ chain_id: 'B', residues: { start: 1, stop: 238 } }]
          }
        ],
        rigid_bodies: [
          {
            name: 'RigidBody1',
            segments: [{ chain_id: 'A', residues: { start: 1, stop: 238 } }]
          },
          {
            name: 'RigidBody2',
            segments: [
              { chain_id: 'C', residues: { start: 1, stop: 26 } },
              { chain_id: 'D', residues: { start: 1, stop: 26 } }
            ]
          }
        ]
      })
    })

    test('a selection used before its define is not resolved', async () => {
      const inpPath = path.join(tempDir, 'use-before-define.inp')
      await fs.writeFile(
        inpPath,
        [
          'shape desc dock1 rigid sele rigid1 end',
          'define rigid1 sele ( resid 1:10 .and. segid PROA ) end',
          'shape desc dock2 rigid sele rigid1 end',
          'return'
        ].join('\n')
      )
      const constraints = extractConstraintsFromYaml(
        await convertInpToYaml(inpPath)
      )
      expect(constraints.rigid_bodies).toEqual([
        {
          name: 'RigidBody1',
          segments: [{ chain_id: 'A', residues: { start: 1, stop: 10 } }]
        }
      ])
    })
  })

  describe('rigid body overlaps', () => {
    const rigid = (
      ...bodies: { chain_id: string; start: number; stop: number }[][]
    ): IMDConstraints => ({
      fixed_bodies: [],
      rigid_bodies: bodies.map((segs, i) => ({
        name: `RigidBody${i + 1}`,
        segments: segs.map(({ chain_id, start, stop }) => ({
          chain_id,
          residues: { start, stop }
        }))
      }))
    })

    test('finds residues shared by two rigid bodies', () => {
      expect(() =>
        assertNoRigidBodyOverlaps(
          rigid(
            [{ chain_id: 'C', start: 1, stop: 26 }],
            [
              { chain_id: 'C', start: 20, stop: 40 },
              { chain_id: 'D', start: 1, stop: 26 }
            ]
          )
        )
      ).toThrow(
        'Rigid bodies must not overlap: RigidBody1 and RigidBody2 both include chain C residues 20-26. '
      )
    })

    test('treats residue ranges as inclusive', () => {
      expect(() =>
        assertNoRigidBodyOverlaps(
          rigid(
            [{ chain_id: 'A', start: 1, stop: 10 }],
            [{ chain_id: 'A', start: 10, stop: 20 }]
          )
        )
      ).toThrow('RigidBody1 and RigidBody2 both include chain A residues 10-10')
    })

    test('allows adjacent ranges, other chains and overlaps within one body', () => {
      expect(() =>
        assertNoRigidBodyOverlaps(
          rigid(
            [
              { chain_id: 'A', start: 1, stop: 10 },
              { chain_id: 'A', start: 5, stop: 15 }
            ],
            [
              { chain_id: 'A', start: 16, stop: 20 },
              { chain_id: 'B', start: 1, stop: 15 }
            ]
          )
        )
      ).not.toThrow()
    })

    test('ignores overlaps between fixed and rigid bodies', () => {
      expect(() =>
        assertNoRigidBodyOverlaps({
          fixed_bodies: [
            {
              name: 'FixedBody1',
              segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
            }
          ],
          rigid_bodies: [
            {
              name: 'RigidBody1',
              segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
            }
          ]
        })
      ).not.toThrow()
    })

    test('handles missing rigid_bodies', () => {
      expect(() =>
        assertNoRigidBodyOverlaps({ fixed_bodies: [] })
      ).not.toThrow()
      expect(() => assertNoRigidBodyOverlaps({})).not.toThrow()
    })

    test('assertNoRigidBodyOverlaps throws a readable error', () => {
      expect(() =>
        assertNoRigidBodyOverlaps(
          rigid(
            [{ chain_id: 'C', start: 1, stop: 26 }],
            [{ chain_id: 'C', start: 1, stop: 26 }]
          )
        )
      ).toThrow(
        /Rigid bodies must not overlap: RigidBody1 and RigidBody2 both include chain C residues 1-26\. A residue can belong to only one rigid body/
      )
    })

    test('validateYamlConstraints rejects overlapping rigid bodies', async () => {
      const yamlPath = path.join(tempDir, 'overlap.yaml')
      await fs.writeFile(
        yamlPath,
        [
          'constraints:',
          '  rigid_bodies:',
          '    - name: RigidBody1',
          '      segments:',
          '        - chain_id: B',
          '          residues: { start: 100, stop: 200 }',
          '    - name: RigidBody2',
          '      segments:',
          '        - chain_id: B',
          '          residues: { start: 150, stop: 250 }'
        ].join('\n')
      )
      await expect(validateYamlConstraints(yamlPath)).rejects.toThrow(
        'Invalid YAML constraints file: Rigid bodies must not overlap: RigidBody1 and RigidBody2 both include chain B residues 150-200'
      )
    })

    test('the shared test fixtures have no overlaps', async () => {
      const yamlPath = path.join(tempDir, 'fixture-no-overlap.yaml')
      await fs.writeFile(yamlPath, testYamlContent)
      await expect(validateYamlConstraints(yamlPath)).resolves.toBeUndefined()

      // The INP fixture, converted to YAML, validates too
      const inpPath = path.join(tempDir, 'fixture-no-overlap.inp')
      await fs.writeFile(inpPath, testInpContent)
      const convertedPath = path.join(tempDir, 'fixture-converted.yaml')
      await fs.writeFile(convertedPath, await convertInpToYaml(inpPath))
      await expect(
        validateYamlConstraints(convertedPath)
      ).resolves.toBeUndefined()
    })
  })
})

describe('long commands and continuation lines', () => {
  const segments = Array.from({ length: 20 }, (_, i) => ({
    chain_id: 'A',
    residues: { start: i * 10 + 1, stop: i * 10 + 5 }
  }))
  // Rigid bodies on chain B, so they don't overlap the fixed ones
  const rigidSegments = segments.map((s) => ({ ...s, chain_id: 'B' }))
  const defines = (prefix: string, segid = 'PROA') =>
    segments.map(
      ({ residues }, i) =>
        `define ${prefix}${i + 1} sele ( resid ${residues.start}:${residues.stop} .and. segid ${segid} ) end`
    )
  const orNames = (prefix: string) =>
    segments.map((_, i) => `${prefix}${i + 1}`).join(' .or. ')

  // How the Inp Jiffy used to wrap: every 77 characters, even mid-word
  const wrapMidWord = (line: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < line.length; i += 77) {
      const piece = line.slice(i, i + 77)
      out.push(i + 77 < line.length ? `${piece}-` : piece)
    }
    return out
  }

  const wrappedInp = [
    ...defines('fixed'),
    ...wrapMidWord(`cons fix sele ${orNames('fixed')} end`),
    '',
    ...defines('rigid', 'PROB'),
    ...wrapMidWord(`shape desc dock1 rigid sele ${orNames('rigid')} end`),
    '',
    'return'
  ].join('\n')

  test('wrapped commands are parsed whole', async () => {
    const inpPath = path.join(tempDir, 'wrapped-parse.inp')
    await fs.writeFile(inpPath, wrappedInp)
    const constraints = extractConstraintsFromYaml(
      await convertInpToYaml(inpPath)
    )
    expect(constraints.fixed_bodies).toEqual([{ name: 'FixedBody1', segments }])
    expect(constraints.rigid_bodies).toEqual([
      { name: 'RigidBody1', segments: rigidSegments }
    ])
  })

  test('an inline comment after a continued command is not parsed as part of it', async () => {
    const inpPath = path.join(tempDir, 'inline-comment.inp')
    await fs.writeFile(
      inpPath,
      [
        'define fixed1 sele ( resid 1:5 .and. segid PROA ) end ! first domain',
        'define rigid1 sele ( resid 11:15 .and. segid PROA ) end',
        'cons fix sele -',
        'fixed1 end ! end of selection',
        'shape desc dock1 rigid sele rigid1 end ! the end',
        'return'
      ].join('\n')
    )
    const constraints = extractConstraintsFromYaml(
      await convertInpToYaml(inpPath)
    )
    expect(constraints.fixed_bodies).toEqual([
      {
        name: 'FixedBody1',
        segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }]
      }
    ])
    expect(constraints.rigid_bodies).toEqual([
      {
        name: 'RigidBody1',
        segments: [{ chain_id: 'A', residues: { start: 11, stop: 15 } }]
      }
    ])
  })
})

describe('fixed and rigid body overlaps', () => {
  // The check is private to validateYamlConstraints, so it is tested
  // through an uploaded YAML file
  const rejects = async (
    fixed: [string, number, number],
    rigid: [string, number, number][]
  ) => {
    const dir = path.join('/tmp', `fixed-rigid-${uuid()}`)
    await fs.ensureDir(dir)
    const segment = ([chain, start, stop]: [string, number, number]) =>
      `        - chain_id: ${chain}\n          residues: { start: ${start}, stop: ${stop} }\n`
    const yamlPath = path.join(dir, 'const.yml')
    await fs.writeFile(
      yamlPath,
      'constraints:\n  fixed_bodies:\n    - name: FixedBody1\n      segments:\n' +
        segment(fixed) +
        '  rigid_bodies:\n' +
        rigid
          .map(
            (r, i) =>
              `    - name: RigidBody${i + 1}\n      segments:\n` + segment(r)
          )
          .join('')
    )
    try {
      return await validateYamlConstraints(yamlPath).then(
        () => null,
        (error: unknown) => (error instanceof Error ? error.message : '')
      )
    } finally {
      await fs.remove(dir)
    }
  }

  test('rejects residues in both a fixed and a rigid body, naming them', async () => {
    expect(
      await rejects(
        ['A', 1, 50],
        [
          ['A', 45, 80],
          ['B', 1, 50]
        ]
      )
    ).toBe(
      'Invalid YAML constraints file: Fixed and rigid bodies must not overlap: FixedBody1 and RigidBody1 both include chain A residues 45-50. A residue is either held in place (fixed) or moves with one rigid body. Remove the shared residues from one of them.'
    )
  })

  test('counts a shared end residue, since ranges are inclusive', async () => {
    expect(await rejects(['A', 1, 50], [['A', 50, 80]])).toMatch(
      /chain A residues 50-50/
    )
  })

  test('accepts bodies that do not share residues', async () => {
    expect(await rejects(['A', 1, 50], [['A', 51, 80]])).toBeNull()
  })
})
