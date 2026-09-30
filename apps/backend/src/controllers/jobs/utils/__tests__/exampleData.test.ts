import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import type { Request } from 'express'

const { exampleRoot } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os') as typeof import('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path') as typeof import('path')
  const root = nodePath.join(
    nodeOs.tmpdir(),
    `example-data-${process.pid}-${Date.now()}`
  )
  process.env.EXAMPLE_DATA = root
  return { exampleRoot: root }
})

vi.mock('../jobUtils.js', async () => {
  const { statSync } = await import('fs')
  return { getFileStats: (filePath: string) => statSync(filePath) }
})

const { default: applyExampleDataIfRequested } =
  await import('../exampleData.js')
const { serverFile } = await import('../serverFiles.js')

const makeReq = (body: Record<string, unknown>) =>
  ({ body }) as unknown as Request

describe('applyExampleDataIfRequested', () => {
  let jobDir: string

  beforeAll(async () => {
    const pdbDir = path.join(exampleRoot, 'pdb')
    await fs.ensureDir(pdbDir)
    for (const file of ['example-const.inp', 'example.pdb', 'example-saxs.dat'])
      await fs.writeFile(path.join(pdbDir, file), file)
    jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'example-job-'))
  })

  afterAll(async () => {
    await fs.remove(exampleRoot)
    await fs.remove(jobDir)
  })

  it('copies the example files and registers them for the handlers', async () => {
    const req = makeReq({ useExampleData: 'true', bilbomd_mode: 'pdb' })

    await applyExampleDataIfRequested(req, jobDir)

    expect(serverFile(req, jobDir, 'pdb_file')?.path).toBe(
      path.join(jobDir, 'example.pdb')
    )
    expect(serverFile(req, jobDir, 'inp_file')?.originalname).toBe(
      'example-const.inp'
    )
    expect(serverFile(req, jobDir, 'dat_file')?.originalname).toBe(
      'example-saxs.dat'
    )
    expect(req.body.pdb_file).toBeUndefined()
  })

  it('registers nothing when example data was not requested', async () => {
    const req = makeReq({ bilbomd_mode: 'pdb', pdb_file: 'example.pdb' })

    const result = await applyExampleDataIfRequested(req, jobDir)

    expect(result).toEqual({ usingExampleData: false })
    expect(serverFile(req, jobDir, 'pdb_file')).toBeUndefined()
  })
})
