import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Request, Response } from 'express'

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import {
  clearExampleConstraintsCache,
  getClassicCrdExampleConstraints,
  getClassicPdbExampleConstraints,
  loadClassicExampleConstraints
} from '../getExampleConstraints.js'

// The repo's example-data folder, which the backend image copies to
// /app/examples
const REPO_EXAMPLES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../example-data'
)

const mockRes = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    }
  }
  return res
}

const call = async (
  handler: (req: Request, res: Response) => Promise<unknown>
) => {
  const res = mockRes()
  await handler({} as Request, res as unknown as Response)
  return res
}

describe('Classic example constraints', () => {
  beforeEach(() => {
    clearExampleConstraintsCache()
    vi.stubEnv('EXAMPLE_DATA', REPO_EXAMPLES)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the PDB example: one fixed body over two chains and one rigid body', async () => {
    const c = await loadClassicExampleConstraints('pdb')
    expect(c.fixed_bodies).toHaveLength(1)
    expect(c.fixed_bodies?.[0].segments).toEqual([
      expect.objectContaining({
        chain_id: 'A',
        residues: { start: 1, stop: 297 }
      }),
      expect.objectContaining({
        chain_id: 'B',
        residues: { start: 16, stop: 42 }
      })
    ])
    expect(c.rigid_bodies).toHaveLength(1)
    expect(c.rigid_bodies?.[0].segments).toEqual([
      expect.objectContaining({
        chain_id: 'B',
        residues: { start: 67, stop: 196 }
      })
    ])
    expect(c.chain_mol_types?.length).toBeGreaterThan(0)
  })

  it('reads the CRD example, keeping the whole DNA segments', async () => {
    const c = await loadClassicExampleConstraints('crd')
    const segids = c.fixed_bodies?.[0].segments.map((s) => s.segid)
    expect(segids).toEqual(['PROA', 'PROA', 'DNAA', 'DNAB'])
    expect(c.rigid_bodies ?? []).toHaveLength(0)
    expect(c.chain_mol_types).toEqual(
      expect.arrayContaining([expect.objectContaining({ mol_type: 'PRO' })])
    )
  })

  it('serves them as { md_constraints }', async () => {
    const res = await call(getClassicPdbExampleConstraints)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      md_constraints: await loadClassicExampleConstraints('pdb')
    })
  })

  it('answers 404 when the example files are missing, and tries again later', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'no-examples-'))
    try {
      vi.stubEnv('EXAMPLE_DATA', empty)
      const missing = await call(getClassicCrdExampleConstraints)
      expect(missing.statusCode).toBe(404)

      // A failure is not cached
      vi.stubEnv('EXAMPLE_DATA', REPO_EXAMPLES)
      const found = await call(getClassicCrdExampleConstraints)
      expect(found.statusCode).toBe(200)
    } finally {
      await fs.remove(empty)
    }
  })

  it('answers 404 when the example const.inp does not import', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bad-examples-'))
    try {
      await fs.copy(path.join(REPO_EXAMPLES, 'pdb'), path.join(dir, 'pdb'))
      await fs.writeFile(
        path.join(dir, 'pdb', 'example-const.inp'),
        'cons fix sele nothing end\nreturn\n'
      )
      vi.stubEnv('EXAMPLE_DATA', dir)
      const res = await call(getClassicPdbExampleConstraints)
      expect(res.statusCode).toBe(404)
    } finally {
      await fs.remove(dir)
    }
  })
})
