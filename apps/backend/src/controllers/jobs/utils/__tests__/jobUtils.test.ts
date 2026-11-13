import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  CONST_INP_WRAP_WIDTH,
  checkConstInpText,
  joinConstInpLines
} from '@bilbomd/bilbomd-types'

vi.mock('../../../../config/config.js', () => ({
  getEnvVar: vi.fn(() => '/tmp')
}))
vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('@bilbomd/mongodb-schema', () => ({ Job: {} }))

const { sanitizeConstInpFile } = await import('../jobUtils.js')

const defines = Array.from(
  { length: 12 },
  (_, i) =>
    `define fixed${i + 1} sele ( resid ${i * 10 + 1}:${i * 10 + 5} .and. segid PROA ) end`
)
const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `fixed${i + 1}`).join(' .or. ')

// Commands as CHARMM reads them, with runs of spaces collapsed
const commands = (text: string) =>
  joinConstInpLines(text)
    .map((c) => c.replace(/ +/g, ' ').trim())
    .filter((c) => c !== '')

describe('sanitizeConstInpFile', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanitize-const-inp-'))
    file = path.join(dir, 'const.inp')
  })

  afterEach(async () => {
    await fs.remove(dir)
  })

  it('keeps a wide continuation line a continuation', async () => {
    // Valid upload: the first line is wider than the wrap width and ends in
    // ' -'. The old sanitizer appended 'end' after the '-', which broke the
    // command and left '.or. fixed9 ...' as a command of its own.
    const original = [
      ...defines,
      `cons fix sele ${names(8)} -`,
      '.or. fixed9 .or. fixed10 .or. fixed11 .or. fixed12 end',
      'return'
    ].join('\n')
    expect(checkConstInpText(original)).toBe(true)
    await fs.writeFile(file, original)

    await sanitizeConstInpFile(file)

    const sanitized = await fs.readFile(file, 'utf-8')
    expect(sanitized).not.toMatch(/- end/)
    for (const line of sanitized.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(CONST_INP_WRAP_WIDTH)
    }
    expect(commands(sanitized)).toEqual(commands(original))
    expect(checkConstInpText(sanitized)).toBe(true)
  })

  it('wraps a long single-line command into the same command', async () => {
    const original = [
      ...defines,
      `cons fix sele ${names(12)} end`,
      'return'
    ].join('\n')
    await fs.writeFile(file, original)

    await sanitizeConstInpFile(file)

    const sanitized = await fs.readFile(file, 'utf-8')
    expect(sanitized.split('\n').length).toBeGreaterThan(
      original.split('\n').length
    )
    expect(commands(sanitized)).toEqual(commands(original))
  })

  it('leaves a file whose lines fit untouched', async () => {
    const original = [
      ...defines.slice(0, 2),
      'cons fix sele fixed1 .or. fixed2 end',
      'return',
      ''
    ].join('\n')
    await fs.writeFile(file, original)

    await sanitizeConstInpFile(file)

    expect(await fs.readFile(file, 'utf-8')).toBe(original)
  })
})
