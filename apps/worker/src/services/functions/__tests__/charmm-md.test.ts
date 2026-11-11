import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import type { Job as BullMQJob } from 'bullmq'
import type { IBilboMDPDBJob } from '@bilbomd/mongodb-schema'

const { state, jobUtils, updateStepStatus } = vi.hoisted(() => ({
  state: { uploadDir: '' },
  jobUtils: {
    makeDir: vi.fn(async () => {}),
    generateInputFile: vi.fn(async () => {}),
    spawnCharmm: vi.fn(async () => {}),
    handleError: vi.fn(async () => {})
  },
  updateStepStatus: vi.fn(async () => {})
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    get uploadDir() {
      return state.uploadDir
    },
    charmmTopoDir: '/topo'
  }
}))
vi.mock('../job-utils.js', () => jobUtils)
vi.mock('../mongo-utils.js', () => ({ updateStepStatus }))
vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { runHeat, runMolecularDynamics } from '../charmm-md.js'

const MQjob = {} as BullMQJob
const job = {
  uuid: 'u1',
  psf_file: 'x.psf',
  const_inp_file: 'const.inp',
  charmm_parameters: { md: { rgyr: [20, 30] } }
} as unknown as IBilboMDPDBJob

const writeConstInp = (...lines: string[]) =>
  fs.outputFile(path.join(state.uploadDir, 'u1', 'const.inp'), lines.join('\n'))

beforeEach(async () => {
  vi.clearAllMocks()
  state.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'charmm-md-'))
})

afterEach(async () => {
  await fs.remove(state.uploadDir)
})

describe.each([
  ['heat', runHeat, 1],
  ['md', runMolecularDynamics, 2]
] as const)('%s', (step, runner, inputFiles) => {
  it('runs CHARMM with an allowed constraint file', async () => {
    await writeConstInp(
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'return'
    )
    await runner(MQjob, job)
    expect(jobUtils.handleError).not.toHaveBeenCalled()
    expect(jobUtils.generateInputFile).toHaveBeenCalledTimes(inputFiles)
    expect(jobUtils.spawnCharmm).toHaveBeenCalledTimes(inputFiles)
  })

  it('fails the step without running CHARMM when the file is not allowed', async () => {
    await writeConstInp('system "id"', 'return')
    await runner(MQjob, job)
    expect(jobUtils.generateInputFile).not.toHaveBeenCalled()
    expect(jobUtils.spawnCharmm).not.toHaveBeenCalled()
    expect(jobUtils.handleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Constraint file const.inp has a line BilboMD does not allow: "system "id""'
      }),
      job,
      step
    )
  })
})
