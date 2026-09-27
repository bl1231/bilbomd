import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { SpawnProcessOptions } from '../../../helpers/runProcess.js'

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

import { spawnPaeToConst } from '../pae-constraints.js'
import { config } from '../../../config/config.js'

const lastOpts = (): SpawnProcessOptions =>
  runProcessMock.mock.calls.at(-1)?.[0]

let tmp: string

beforeEach(async () => {
  vi.clearAllMocks()
  runProcessMock.mockResolvedValue({ code: 0 })
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pae-const-'))
})

afterEach(async () => {
  await fs.remove(tmp)
})
describe('spawnPaeToConst', () => {
  const setup = async () => {
    const script = path.join(tmp, 'pae2const.py')
    await fs.writeFile(script, '')
    await fs.writeFile(path.join(tmp, 'model.pdb'), '')
    await fs.writeFile(path.join(tmp, 'pae.json'), '{}')
    return script
  }

  it('runs pae2const.py appending to af2pae logs, with the helper timeout', async () => {
    const script = await setup()

    const result = await spawnPaeToConst({
      out_dir: tmp,
      in_pdb: 'model.pdb',
      in_pae: 'pae.json',
      plddt_cutoff: 50,
      python_bin: '/usr/bin/python3',
      script_path: script
    })

    expect(result).toBe('0')
    expect(lastOpts()).toEqual(
      expect.objectContaining({
        label: 'pae2const.py',
        cmd: '/usr/bin/python3',
        args: [
          script,
          '--pdb_file',
          'model.pdb',
          '--plddt_cutoff',
          '50',
          'pae.json'
        ],
        cwd: tmp,
        stdoutFile: path.join(tmp, 'af2pae.log'),
        stderrFile: path.join(tmp, 'af2pae_error.log'),
        appendLogs: true,
        timeoutMs: config.processTimeouts.helperScriptMs
      })
    )
  })

  it('does not run when the PAE file is missing', async () => {
    const script = await setup()
    await fs.remove(path.join(tmp, 'pae.json'))

    await expect(
      spawnPaeToConst({
        out_dir: tmp,
        in_pdb: 'model.pdb',
        in_pae: 'pae.json',
        script_path: script
      })
    ).rejects.toThrow('PAE file not found')
    expect(runProcessMock).not.toHaveBeenCalled()
  })

  it('propagates script failures', async () => {
    const script = await setup()
    runProcessMock.mockRejectedValue(
      new Error('pae2const.py exited with code 2')
    )

    await expect(
      spawnPaeToConst({
        out_dir: tmp,
        in_pdb: 'model.pdb',
        in_pae: 'pae.json',
        script_path: script
      })
    ).rejects.toThrow('pae2const.py exited with code 2')
  })
})
