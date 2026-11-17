import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { writeConstInp, type MDConstraintsDTO } from '@bilbomd/bilbomd-types'
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

  const fixedNames = (count: number) =>
    Array.from({ length: count }, (_, i) => `fixed${i + 1}`).join(' .or. ')

  it('accepts a command continued over several lines', async () => {
    await write(
      'const.inp',
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      `cons fix sele ${fixedNames(5)} .or. fix-`,
      `ed6 .or. ${fixedNames(3)} end`,
      'return'
    )
    await expect(assertConstInpAllowed(dir, 'const.inp')).resolves.toBe(
      undefined
    )
  })

  it('rejects a line too long for CHARMM', async () => {
    await write(
      'const.inp',
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      `cons fix sele ${fixedNames(20)} end`,
      'return'
    )
    await expect(assertConstInpAllowed(dir, 'const.inp')).rejects.toThrow(
      /^Constraint file const.inp: Line 2 is longer than 200 characters/
    )
  })

  it('fails when the file is missing', async () => {
    await expect(assertConstInpAllowed(dir, 'const.inp')).rejects.toThrow(
      /ENOENT/
    )
  })

  describe('with stored constraints', () => {
    // md_constraints as the backend stores them for a structured submission
    const stored: MDConstraintsDTO = {
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', segid: 'PROA', residues: { start: 1, stop: 50 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'RigidBody1',
          segments: [
            {
              chain_id: 'B',
              segid: 'DNAB',
              residues: { start: 1, stop: 20 },
              whole_segment: true
            }
          ]
        }
      ]
    }
    const expected = () =>
      writeConstInp({
        fixed_bodies: stored.fixed_bodies!.map((b) => ({
          name: b.name,
          segments: b.segments.map((s) => ({ ...s, segid: s.segid! }))
        })),
        rigid_bodies: stored.rigid_bodies!.map((b) => ({
          name: b.name,
          segments: b.segments.map((s) => ({
            chain_id: s.chain_id,
            segid: s.segid!,
            residues: s.residues,
            whole_segment: true as const
          }))
        }))
      })

    it('accepts the file BilboMD wrote for them', async () => {
      await fs.writeFile(path.join(dir, 'const.inp'), expected())
      await expect(
        assertConstInpAllowed(dir, 'const.inp', stored)
      ).resolves.toBe(undefined)
    })

    it('rejects a file changed after submission', async () => {
      // Allowed commands only, but not what the constraints say
      await fs.writeFile(
        path.join(dir, 'const.inp'),
        expected().replace('resid 1:50', 'resid 1:60')
      )
      await expect(
        assertConstInpAllowed(dir, 'const.inp', stored)
      ).rejects.toThrow(/does not match the job's constraints/)
    })

    it('checks lines only when the constraints have no segids (older jobs)', async () => {
      await write(
        'const.inp',
        'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'return'
      )
      const old: MDConstraintsDTO = {
        fixed_bodies: [
          {
            name: 'FixedBody1',
            segments: [{ chain_id: 'A', residues: { start: 1, stop: 5 } }]
          }
        ]
      }
      await expect(assertConstInpAllowed(dir, 'const.inp', old)).resolves.toBe(
        undefined
      )
    })
  })
})
