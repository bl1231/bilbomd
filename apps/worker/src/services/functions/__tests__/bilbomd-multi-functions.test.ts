import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { User, type IMultiJob } from '@bilbomd/mongodb-schema'

const { runProcessMock, updateStepStatusMock, makeDirMock } = vi.hoisted(
  () => ({
    runProcessMock: vi.fn(),
    updateStepStatusMock: vi.fn(),
    makeDirMock: vi.fn()
  })
)

vi.mock('../../../helpers/runProcess.js', () => ({
  runProcess: runProcessMock
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: updateStepStatusMock
}))

vi.mock('../job-utils.js', () => ({
  makeDir: makeDirMock
}))

vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))

vi.mock('../../../helpers/mailer.js', () => ({
  sendJobCompleteEmail: vi.fn()
}))

vi.mock('../../../helpers/emailPreferences.js', () => ({
  wantsJobEmails: vi.fn().mockResolvedValue(true),
  JOB_EMAILS_OFF_MESSAGE: 'Not sent: job emails are turned off in settings'
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import {
  spawnMultiFoxs,
  runMultiFoxs,
  prepareMultiMDResults,
  initializeJob,
  cleanupJob
} from '../bilbomd-multi-functions.js'
import { notifyJobChanged } from '../../../helpers/jobEvents.js'
import { config } from '../../../config/config.js'
import { sendJobCompleteEmail } from '../../../helpers/mailer.js'
import { wantsJobEmails } from '../../../helpers/emailPreferences.js'

const makeJob = (overrides: Partial<IMultiJob> = {}) =>
  ({
    uuid: 'multi-uuid',
    title: 'multi',
    data_file_from: 'job-a',
    bilbomd_jobs: [
      { uuid: 'job-a', data_file: 'saxs_a.dat' },
      { uuid: 'job-b', data_file: 'saxs_b.dat' }
    ],
    ...overrides
  }) as unknown as IMultiJob

describe('bilbomd-multi-functions - spawnMultiFoxs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue({ code: 0 })
  })

  it("fits against the chosen job's SAXS data from <uuid>/multifoxs", async () => {
    await spawnMultiFoxs(makeJob())

    const multiDir = path.join(config.uploadDir, 'multi-uuid', 'multifoxs')
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'MultiFoXS',
        cmd: config.multifoxsBin,
        args: [
          '-o',
          path.join(config.uploadDir, 'job-a', 'saxs_a.dat'),
          '../multi_md_foxs_files.txt'
        ],
        cwd: multiDir,
        stdoutFile: path.join(multiDir, 'multi_foxs.log'),
        stderrFile: path.join(multiDir, 'multi_foxs_error.log'),
        timeoutMs: config.processTimeouts.multifoxsMs
      })
    )
  })

  it('does not run MultiFoXS when the data source job is missing', async () => {
    await expect(
      spawnMultiFoxs(makeJob({ data_file_from: 'nope' }))
    ).rejects.toThrow('No job found in bilbomd_jobs')
    expect(runProcessMock).not.toHaveBeenCalled()
  })

  it('propagates MultiFoXS failures', async () => {
    runProcessMock.mockRejectedValue(
      new Error('MultiFoXS timed out after 7200s')
    )

    await expect(spawnMultiFoxs(makeJob())).rejects.toThrow(
      'MultiFoXS timed out after 7200s'
    )
  })
})

const stepStatuses = () =>
  updateStepStatusMock.mock.calls.map(([, step, s]) => [step, s.status])

describe('bilbomd-multi-functions - runMultiFoxs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runProcessMock.mockResolvedValue({ code: 0 })
    makeDirMock.mockResolvedValue(undefined)
  })

  it('marks the multifoxs step as done', async () => {
    await runMultiFoxs(makeJob())

    expect(stepStatuses()).toEqual([
      ['multifoxs', 'Running'],
      ['multifoxs', 'Success']
    ])
  })

  it('marks the step as failed and rethrows when MultiFoXS fails', async () => {
    runProcessMock.mockRejectedValue(new Error('MultiFoXS exited with code 1'))

    await expect(runMultiFoxs(makeJob())).rejects.toThrow(
      'MultiFoXS exited with code 1'
    )
    expect(stepStatuses()).toEqual([
      ['multifoxs', 'Running'],
      ['multifoxs', 'Error']
    ])
    expect(updateStepStatusMock.mock.calls.at(-1)?.[2].message).toContain(
      'MultiFoXS exited with code 1'
    )
  })
})

describe('bilbomd-multi-functions - prepareMultiMDResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks the results step as failed and rethrows', async () => {
    makeDirMock.mockRejectedValue(new Error('EACCES: permission denied'))

    await expect(prepareMultiMDResults(makeJob())).rejects.toThrow(
      'EACCES: permission denied'
    )
    expect(stepStatuses()).toEqual([
      ['results', 'Running'],
      ['results', 'Error']
    ])
  })
})

describe('bilbomd-multi-functions - job start and finish', () => {
  const userLookup = (user: object | null) =>
    vi.spyOn(User, 'findById').mockReturnValue({
      lean: () => ({ exec: async () => user })
    } as unknown as ReturnType<typeof User.findById>)

  const savingJob = () => {
    const job = makeJob({ user: 'owner-1' } as unknown as Partial<IMultiJob>)
    const save = vi.fn(async () => {
      // notification must come after the change is saved
      expect(notifyJobChanged).not.toHaveBeenCalled()
    })
    Object.assign(job, { save })
    return { job, save }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('tells the UI once the job is marked Running', async () => {
    userLookup({ _id: 'owner-1' })
    const { job, save } = savingJob()

    await initializeJob(job)

    expect(job.status).toBe('Running')
    expect(save).toHaveBeenCalled()
    expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(job)
  })

  it('tells the UI once the job is marked Completed', async () => {
    userLookup(null)
    const { job, save } = savingJob()

    await cleanupJob(job)

    expect(job.status).toBe('Completed')
    expect(save).toHaveBeenCalled()
    expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(job)
  })

  describe('job emails', () => {
    const owner = { _id: 'owner-1', email: 'owner@example.com' }
    let sendEmails: boolean

    beforeEach(() => {
      sendEmails = config.sendEmailNotifications
      config.sendEmailNotifications = true
      vi.mocked(wantsJobEmails).mockResolvedValue(true)
    })
    afterEach(() => {
      config.sendEmailNotifications = sendEmails
    })

    it('emails the owner when the job completes', async () => {
      userLookup(owner)
      const { job } = savingJob()
      Object.assign(job, { _id: 'multi-id' })

      await cleanupJob(job)

      expect(sendJobCompleteEmail).toHaveBeenCalledWith(
        'owner@example.com',
        config.bilbomdUrl,
        'multi-id',
        'multi',
        false
      )
    })

    it('skips the email when the owner turned job emails off', async () => {
      userLookup(owner)
      vi.mocked(wantsJobEmails).mockResolvedValueOnce(false)
      const { job } = savingJob()

      await cleanupJob(job)

      expect(sendJobCompleteEmail).not.toHaveBeenCalled()
      expect(updateStepStatusMock).toHaveBeenCalledWith(job, 'email', {
        status: 'Success',
        message: 'Not sent: job emails are turned off in settings'
      })
    })
  })
})
