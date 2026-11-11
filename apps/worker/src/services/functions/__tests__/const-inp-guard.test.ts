import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { assertConstInpAllowed } from '../const-inp-guard.js'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'const-inp-guard-'))
})

afterEach(async () => {
  await fs.remove(dir)
})

const write = (name: string, ...lines: string[]) =>
  fs.writeFile(path.join(dir, name), lines.join('\n'))

describe('assertConstInpAllowed', () => {
  it('accepts a constraint file made of allowed commands', async () => {
    await write(
      'const.inp',
      '* constraints',
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'return'
    )
    await expect(assertConstInpAllowed(dir, 'const.inp')).resolves.toBe(
      undefined
    )
  })

  it('rejects a file with a system command', async () => {
    await write(
      'const.inp',
      '* constraints',
      'bomlev -5',
      'system "touch ../../x.txt"'
    )
    await expect(assertConstInpAllowed(dir, 'const.inp')).rejects.toThrow(
      'Constraint file const.inp has a line BilboMD does not allow: "bomlev -5"'
    )
  })

  it('truncates a long offending line in the message', async () => {
    await write('const.inp', `system "${'x'.repeat(200)}"`)
    await expect(assertConstInpAllowed(dir, 'const.inp')).rejects.toThrow(
      /"system "x{72}\.\.\."$/
    )
  })

  it.each(['../const.inp', 'a b.inp', 'x.inp\nsystem "id"', '-x.inp', ''])(
    'rejects the file name %j',
    async (name) => {
      await expect(assertConstInpAllowed(dir, name)).rejects.toThrow(
        /Constraint file name not allowed/
      )
    }
  )

  it('fails when the file is missing', async () => {
    await expect(assertConstInpAllowed(dir, 'const.inp')).rejects.toThrow(
      /ENOENT/
    )
  })
})
