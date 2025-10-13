import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  convertInpToYaml,
  convertYamlToInp,
  validateYamlConstraints,
  validateInpConstraints
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
