import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { writeSegidToChainid } from '../bilbomd-functions.js'

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bilbomd-fns-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})

describe('writeSegidToChainid', () => {
  it('sets each atom’s chain ID to the last character of its segid', async () => {
    const atom = (chain: string, segid: string) =>
      `ATOM      1  N   MET ${chain}   1      11.104   6.134  -6.504  1.00  0.00      ${segid}`
    const file = path.join(tmp, 'model.pdb')
    await fs.writeFile(
      file,
      ['REMARK kept as is', atom(' ', 'PROA'), atom('X', 'PROB'), 'END'].join(
        '\n'
      )
    )

    await writeSegidToChainid(file)

    const lines = (await fs.readFile(file, 'utf-8')).split('\n')
    expect(lines[0]).toBe('REMARK kept as is')
    expect(lines[1][21]).toBe('A')
    expect(lines[2][21]).toBe('B')
    expect(lines[1].slice(72, 76)).toBe('PROA')
    expect(lines[3]).toBe('END')
  })
})
