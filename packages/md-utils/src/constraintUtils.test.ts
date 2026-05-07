import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  convertInpToYaml,
  convertYamlToInp,
  validateYamlConstraints,
  validateInpConstraints,
  extractConstraintsFromYaml,
  buildChainSegidMap
} from './constraintUtils.js'
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

  describe('YAML to INP conversion', () => {
    test('should convert OpenMM YAML to CHARMM INP format', async () => {
      expect.assertions(4)

      const yamlPath = path.join(tempDir, 'test.yaml')
      await fs.writeFile(yamlPath, testYamlContent)

      const inpResult = await convertYamlToInp(yamlPath)

      expect(inpResult).toBeDefined()
      expect(inpResult).toContain('define')
      expect(inpResult).toContain('cons fix')
      expect(inpResult).toContain('shape desc')
    })

    test('should correctly map chain IDs to CHARMM segments', async () => {
      expect.assertions(3)

      const yamlPath = path.join(tempDir, 'chain-test.yaml')
      await fs.writeFile(yamlPath, testYamlContent)

      const inpResult = await convertYamlToInp(yamlPath)

      expect(inpResult).toContain('segid PROA') // A -> PROA
      expect(inpResult).toContain('segid PROB') // B -> PROB
      expect(inpResult).toContain('segid PROC') // C -> PROC
    })

    test('should end with return statement', async () => {
      expect.assertions(1)

      const yamlPath = path.join(tempDir, 'return-test.yaml')
      await fs.writeFile(yamlPath, testYamlContent)

      const inpResult = await convertYamlToInp(yamlPath)

      expect(inpResult).toContain('return')
    })
  })

  describe('Validation', () => {
    test('should validate valid INP files', async () => {
      expect.assertions(1)

      const inpPath = path.join(tempDir, 'valid.inp')
      await fs.writeFile(inpPath, testInpContent)

      await expect(validateInpConstraints(inpPath)).resolves.toBeUndefined()
    })

    test('should reject empty INP files', async () => {
      expect.assertions(1)

      const inpPath = path.join(tempDir, 'empty.inp')
      await fs.writeFile(inpPath, '')

      await expect(validateInpConstraints(inpPath)).rejects.toThrow(
        'Empty INP constraint file'
      )
    })

    test('should reject INP files containing "system" directive', async () => {
      expect.assertions(1)

      const inpPath = path.join(tempDir, 'system.inp')
      await fs.writeFile(
        inpPath,
        `define fixed1 sele ( resid 1:639 .and. segid PROA ) end
cons fix sele fixed1 end
system rm -rf /tmp/bilbomd
return`
      )

      await expect(validateInpConstraints(inpPath)).rejects.toThrow(
        'Disallowed keyword'
      )
    })

    test('should reject INP files containing "open" directive', async () => {
      expect.assertions(1)

      const inpPath = path.join(tempDir, 'open.inp')
      await fs.writeFile(
        inpPath,
        `define fixed1 sele ( resid 1:639 .and. segid PROA ) end
cons fix sele fixed1 end
open unit 1 read card name /etc/passwd
return`
      )

      await expect(validateInpConstraints(inpPath)).rejects.toThrow(
        'Disallowed keyword'
      )
    })

    test('should allow comment lines starting with ! or *', async () => {
      expect.assertions(1)

      const inpPath = path.join(tempDir, 'comments.inp')
      await fs.writeFile(
        inpPath,
        `! This is a comment
* Another comment style
define fixed1 sele ( resid 1:639 .and. segid PROA ) end
cons fix sele fixed1 end
return`
      )

      await expect(validateInpConstraints(inpPath)).resolves.toBeUndefined()
    })

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

  describe('buildChainSegidMap', () => {
    // PDB columns (0-indexed): 0-5 record type, 17-19 resName, 21 chainId
    const makePdbLine = (record: string, resName: string, chainId: string) =>
      record.padEnd(6) + '    1  CA  ' + resName.padEnd(3) + ' ' + chainId

    test('maps protein chain to PRO prefix', async () => {
      const pdbPath = path.join(tempDir, 'protein.pdb')
      await fs.writeFile(pdbPath, makePdbLine('ATOM', 'ALA', 'A') + '\n')
      expect(await buildChainSegidMap(pdbPath)).toEqual({ A: 'PROA' })
    })

    test('maps DNA chain to DNA prefix', async () => {
      const pdbPath = path.join(tempDir, 'dna.pdb')
      await fs.writeFile(pdbPath, makePdbLine('ATOM', 'DA', 'D') + '\n')
      expect(await buildChainSegidMap(pdbPath)).toEqual({ D: 'DNAD' })
    })

    test('maps RNA chain to RNA prefix', async () => {
      const pdbPath = path.join(tempDir, 'rna.pdb')
      await fs.writeFile(pdbPath, makePdbLine('ATOM', 'A', 'R') + '\n')
      expect(await buildChainSegidMap(pdbPath)).toEqual({ R: 'RNAR' })
    })

    test('maps carbohydrate chain to CAR prefix', async () => {
      const pdbPath = path.join(tempDir, 'carb.pdb')
      await fs.writeFile(pdbPath, makePdbLine('HETATM', 'NAG', 'G') + '\n')
      expect(await buildChainSegidMap(pdbPath)).toEqual({ G: 'CARG' })
    })

    test('ignores unknown residue types', async () => {
      const pdbPath = path.join(tempDir, 'unknown-res.pdb')
      await fs.writeFile(pdbPath, makePdbLine('ATOM', 'XYZ', 'X') + '\n')
      expect(await buildChainSegidMap(pdbPath)).toEqual({})
    })

    test('ignores non-ATOM/HETATM lines', async () => {
      const pdbPath = path.join(tempDir, 'remarks.pdb')
      const content = [
        'REMARK   1 test',
        makePdbLine('ATOM', 'ALA', 'A'),
        'TER',
        'END'
      ].join('\n')
      await fs.writeFile(pdbPath, content)
      expect(await buildChainSegidMap(pdbPath)).toEqual({ A: 'PROA' })
    })

    test('classifies chain by its first residue only', async () => {
      const pdbPath = path.join(tempDir, 'multi-res.pdb')
      const content = [
        makePdbLine('ATOM', 'ALA', 'A'),
        makePdbLine('ATOM', 'DA', 'A')
      ].join('\n')
      await fs.writeFile(pdbPath, content)
      expect(await buildChainSegidMap(pdbPath)).toEqual({ A: 'PROA' })
    })
  })

  describe('validateInpConstraints additional paths', () => {
    test('rejects file missing define statement', async () => {
      const inpPath = path.join(tempDir, 'no-define.inp')
      await fs.writeFile(inpPath, 'cons fix sele some_selection end\n')
      await expect(validateInpConstraints(inpPath)).rejects.toThrow(
        'INP file must contain at least one "define" statement'
      )
    })

    test('rejects file missing constraint command', async () => {
      const inpPath = path.join(tempDir, 'no-constraint.inp')
      await fs.writeFile(inpPath, 'define fixed1 sele something end\n')
      await expect(validateInpConstraints(inpPath)).rejects.toThrow(
        'INP file must contain at least one constraint command'
      )
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

  describe('convertYamlToInp with chainSegidMap', () => {
    test('uses provided map for segid resolution', async () => {
      const yamlPath = path.join(tempDir, 'segid-map.yaml')
      await fs.writeFile(yamlPath, testYamlContent)
      const result = await convertYamlToInp(yamlPath, undefined, {
        A: 'PROA',
        B: 'DNAD',
        C: 'RNAC'
      })
      expect(result).toContain('segid PROA')
      expect(result).toContain('segid DNAD')
      expect(result).toContain('segid RNAC')
    })

    test('handles wrapped YAML format', async () => {
      const wrapped =
        'constraints:\n' +
        testYamlContent
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      const yamlPath = path.join(tempDir, 'wrapped-convert.yaml')
      await fs.writeFile(yamlPath, wrapped)
      const result = await convertYamlToInp(yamlPath)
      expect(result).toContain('define')
      expect(result).toContain('return')
    })
  })

  describe('error paths', () => {
    test('convertInpToYaml throws on missing file', async () => {
      await expect(convertInpToYaml('/nonexistent/file.inp')).rejects.toThrow(
        'Failed to convert INP to YAML'
      )
    })

    test('convertYamlToInp throws on missing file', async () => {
      await expect(
        convertYamlToInp('/nonexistent/file.yaml')
      ).rejects.toThrow('Failed to convert YAML to INP')
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

  describe('Round-trip conversion', () => {
    test('should maintain data integrity through INP -> YAML -> INP conversion', async () => {
      expect.assertions(3)

      // Start with INP
      const originalInpPath = path.join(tempDir, 'original.inp')
      await fs.writeFile(originalInpPath, testInpContent)

      // Convert to YAML
      const yamlResult = await convertInpToYaml(originalInpPath)
      const yamlPath = path.join(tempDir, 'converted.yaml')
      await fs.writeFile(yamlPath, yamlResult)

      // Convert back to INP
      const finalInpResult = await convertYamlToInp(yamlPath)

      expect(finalInpResult).toContain('define')
      expect(finalInpResult).toContain('cons fix')
      expect(finalInpResult).toContain('shape desc')
    })

    test('should maintain data integrity through YAML -> INP -> YAML conversion', async () => {
      expect.assertions(3)

      // Start with YAML
      const originalYamlPath = path.join(tempDir, 'original.yaml')
      await fs.writeFile(originalYamlPath, testYamlContent)

      // Convert to INP
      const inpResult = await convertYamlToInp(originalYamlPath)
      const inpPath = path.join(tempDir, 'converted.inp')
      await fs.writeFile(inpPath, inpResult)

      // Convert back to YAML
      const finalYamlResult = await convertInpToYaml(inpPath)

      expect(finalYamlResult).toContain('fixed_bodies:')
      expect(finalYamlResult).toContain('rigid_bodies:')
      expect(finalYamlResult).toContain('chain_id:')
    })
  })
})
