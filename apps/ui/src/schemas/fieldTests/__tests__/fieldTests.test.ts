import { describe, it, expect, vi } from 'vitest'
import {
  fileExtTest,
  fileNameLengthTest,
  fileSizeTest,
  noSpacesTest,
  requiredFile,
  saxsCheck,
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

  it('saxsCheck uses isSaxsData result', async () => {
    const schema = saxsCheck()
    const validContent = `# Q I(Q) Error\n9.37500000E-03 6.52879323E+01 9.99156442E+00\n`
    const invalidContent = `not a saxs file\n`
    await expect(
      schema.isValid(makeFile('ok.dat', validContent))
    ).resolves.toBe(true)
    await expect(
      schema.isValid(makeFile('bad.txt', invalidContent))
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
