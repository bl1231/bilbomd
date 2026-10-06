import { describe, it, expect, vi } from 'vitest'
import { object } from 'yup'
import {
  fileExtTest,
  fileNameLengthTest,
  fileSizeTest,
  noSpacesTest,
  requiredFile,
  saxsCheck,
  sansCheck,
  qUnitsField,
  jsonFileCheck
} from '../fieldTests'

// Helpers
const makeFile = (
  name: string,
  content = 'x',
  type = 'text/plain',
  size = content.length
) => {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('fieldTests', () => {
  it('fileExtTest accepts only given extension', async () => {
    const schema = fileExtTest('dat')
    await expect(schema.isValid(makeFile('data.dat'))).resolves.toBe(true)
    await expect(schema.isValid(makeFile('data.txt'))).resolves.toBe(false)
  })

  it('fileNameLengthTest enforces <= 30 chars', async () => {
    const schema = fileNameLengthTest()
    await expect(schema.isValid(makeFile('a'.repeat(30)))).resolves.toBe(true)
    await expect(schema.isValid(makeFile('a'.repeat(31)))).resolves.toBe(false)
  })

  it('fileSizeTest enforces max size', async () => {
    const schema = fileSizeTest(10)
    await expect(
      schema.isValid(makeFile('small.dat', 'x'.repeat(10)))
    ).resolves.toBe(true)
    await expect(
      schema.isValid(makeFile('big.dat', 'x'.repeat(11)))
    ).resolves.toBe(false)
  })

  it('noSpacesTest rejects names with spaces', async () => {
    // Mock noSpaces to reflect real behavior
    vi.doMock('../../ValidationFunctions', () => ({
      noSpaces: (file: File) => !file.name.includes(' ')
    }))
    const schema = noSpacesTest()
    await expect(schema.isValid(makeFile('no_spaces.dat'))).resolves.toBe(true)
    await expect(schema.isValid(makeFile('has spaces.dat'))).resolves.toBe(
      false
    )
  })

  it('requiredFile accepts File or string', async () => {
    const schema = requiredFile('required')
    await expect(schema.isValid(makeFile('any.dat'))).resolves.toBe(true)
    await expect(schema.isValid('existing-filename.dat')).resolves.toBe(true)
    await expect(schema.isValid(null as unknown as File)).resolves.toBe(false)
  })

  // Guinier-like curve for a 30 Å particle; qScale 10 writes it in nm⁻¹
  const saxsCurve = (qScale = 1) =>
    Array.from({ length: 150 }, (_, k) => {
      const q = 0.01 + k * 0.002
      const intensity = 1000 * Math.exp(-(q * q * 900) / 3) + 1
      return `${(q * qScale).toFixed(4)} ${intensity.toFixed(4)} ${(intensity * 0.02).toFixed(4)}`
    }).join('\n')

  it('saxsCheck accepts SAXS data and rejects other content', async () => {
    const schema = saxsCheck()
    await expect(schema.isValid(makeFile('ok.dat', saxsCurve()))).resolves.toBe(
      true
    )
    await expect(
      schema.isValid(makeFile('bad.txt', 'not a saxs file\n'))
    ).resolves.toBe(false)
  })

  it('saxsCheck reads q_units from the sibling field', async () => {
    const schema = object({ q_units: qUnitsField(), dat_file: saxsCheck() })
    // A small particle measured to wide angle cannot be told from a large
    // particle in nm⁻¹ without being told the units
    const ambiguous = Array.from({ length: 300 }, (_, k) => {
      const q = 0.01 + k * 0.005
      const intensity = 1000 * Math.exp(-(q * q * 225) / 3) + 1
      return `${q.toFixed(4)} ${intensity.toFixed(4)} ${(intensity * 0.02).toFixed(4)}`
    }).join('\n')
    const file = makeFile('small.dat', ambiguous)
    await expect(
      schema.isValid({ q_units: 'auto', dat_file: file })
    ).resolves.toBe(false)
    await expect(
      schema.isValid({ q_units: 'A', dat_file: file })
    ).resolves.toBe(true)
    await expect(
      schema.validateAt('dat_file', { q_units: 'auto', dat_file: file })
    ).rejects.toThrow(/q_units/)
  })

  it('qUnitsField accepts only auto, A and nm', async () => {
    const schema = qUnitsField()
    await expect(schema.isValid('auto')).resolves.toBe(true)
    await expect(schema.isValid('nm')).resolves.toBe(true)
    await expect(schema.isValid('angstrom')).resolves.toBe(false)
  })

  it('sansCheck keeps the legacy first-q check', async () => {
    const schema = sansCheck()
    const validContent = `# Q I(Q) Error\n9.37500000E-03 6.52879323E+01 9.99156442E+00\n`
    await expect(
      schema.isValid(makeFile('ok.dat', validContent))
    ).resolves.toBe(true)
    await expect(
      schema.isValid(makeFile('bad.txt', 'not a sans file\n'))
    ).resolves.toBe(false)
  })

  it('jsonFileCheck validates JSON content', async () => {
    const good = makeFile(
      'pae.json',
      JSON.stringify({ a: 1 }),
      'application/json'
    )
    const bad = makeFile('pae.json', '{ bad json', 'application/json')
    await expect(jsonFileCheck().isValid(good)).resolves.toBe(true)
    await expect(jsonFileCheck().isValid(bad)).resolves.toBe(false)
  })
})
