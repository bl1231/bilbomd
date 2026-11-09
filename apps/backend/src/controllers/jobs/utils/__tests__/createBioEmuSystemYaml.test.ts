import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { parse } from 'yaml'
import type { IBioEmuEntity } from '@bilbomd/mongodb-schema'

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
  buildBioEmuSystem,
  chainId,
  createBioEmuSystemYaml
} from '../createBioEmuSystemYaml.js'

const entity = (
  sequence: string,
  copies: number,
  type: IBioEmuEntity['type'] = 'Protein'
): IBioEmuEntity => ({ name: 'e', sequence, copies, type })

describe('chainId', () => {
  it('runs A..Z, then AA, AB, ...', () => {
    expect(chainId(0)).toBe('A')
    expect(chainId(25)).toBe('Z')
    expect(chainId(26)).toBe('AA')
    expect(chainId(27)).toBe('AB')
    expect(chainId(52)).toBe('BA')
  })
})

describe('buildBioEmuSystem', () => {
  it('maps copies to chain IDs, continuing across entities', () => {
    expect(
      buildBioEmuSystem([entity('ACDEF', 2), entity('ACGT', 2, 'DNA')])
    ).toEqual({
      entities: [
        {
          entity_type: 'protein',
          asym_ids: ['A', 'B'],
          sequence: 'ACDEF',
          mods: []
        },
        { entity_type: 'dna', asym_ids: ['C', 'D'], sequence: 'ACGT', mods: [] }
      ],
      bonds: []
    })
  })
})

describe('createBioEmuSystemYaml', () => {
  let jobDir: string
  beforeEach(async () => {
    jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bioemu-yaml-'))
  })
  afterEach(async () => {
    await fs.remove(jobDir)
  })

  it('writes bioemu/system.yaml and returns its job-relative path', async () => {
    const rel = await createBioEmuSystemYaml([entity('MKV', 1)], jobDir)
    expect(rel).toBe(path.join('bioemu', 'system.yaml'))
    const written = parse(await fs.readFile(path.join(jobDir, rel), 'utf8'))
    expect(written.entities[0]).toEqual({
      entity_type: 'protein',
      asym_ids: ['A'],
      sequence: 'MKV',
      mods: []
    })
  })
})
