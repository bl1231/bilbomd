import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { Job as BullMQJob } from 'bullmq'

const { runProcessMock, updateStepStatusMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  updateStepStatusMock: vi.fn()
}))

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { spawnPepsiSANS } from '../sans-pepsisans.js'
import { config } from '../../../config/config.js'

const makeMQJob = () =>
  ({ updateProgress: vi.fn(), log: vi.fn() }) as unknown as BullMQJob

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pepsisans-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})
describe('spawnPepsiSANS', () => {
  it('runs Pepsi-SANS once per PDB and writes the results CSV', async () => {
    const runDir = path.join(tmp, 'rg_25')
    await fs.ensureDir(runDir)
    await fs.writeFile(path.join(runDir, 'm1.pdb'), '')
    await fs.writeFile(path.join(runDir, 'm2.pdb'), '')
    await fs.writeFile(path.join(runDir, 'readme.txt'), '')

    await spawnPepsiSANS(runDir, ['--deut', '0.5'], makeMQJob())

    expect(runProcessMock).toHaveBeenCalledTimes(2)
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Pepsi-SANS m1.pdb',
        cmd: 'Pepsi-SANS',
        args: [
          path.join(runDir, 'm1.pdb'),
          '-o',
          path.join(runDir, 'm1.dat'),
          '--deut',
          '0.5'
        ],
        timeoutMs: config.processTimeouts.pepsiSansMs
      })
    )
    const csv = await fs.readFile(
      path.join(runDir, 'pepsisans_rg_25.csv'),
      'utf8'
    )
    expect(csv.split('\n')).toEqual([
      'PDBNAME,SCATTERINGFILE,DAT_DIRECTORY',
      'm1.pdb,m1.dat,rg_25',
      'm2.pdb,m2.dat,rg_25'
    ])
  })

  it('fails when any Pepsi-SANS run fails', async () => {
    const runDir = path.join(tmp, 'rg_25')
    await fs.ensureDir(runDir)
    await fs.writeFile(path.join(runDir, 'm1.pdb'), '')
    runProcessMock.mockRejectedValue(
      new Error('Pepsi-SANS m1.pdb exited with code 1')
    )

    await expect(spawnPepsiSANS(runDir, [], makeMQJob())).rejects.toThrow(
      'Pepsi-SANS m1.pdb exited with code 1'
    )
  })
})
