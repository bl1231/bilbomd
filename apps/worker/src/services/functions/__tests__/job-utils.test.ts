import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  initializeJob,
  cleanupJob,
  makeDir,
  makeFile,
  generateInputFile,
  handleError,
  runPipelineStep,
  spawnCharmm
} from '../job-utils.js'
import { User, type IJob, type IUser } from '@bilbomd/mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../../helpers/loggers.js'
import { sendJobCompleteEmail } from '../../../helpers/mailer.js'
import { config } from '../../../config/config.js'
import fs from 'fs-extra'
import { updateStepStatus, updateJobStatus } from '../mongo-utils.js'
import { Types } from 'mongoose'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../../../helpers/mailer.js', () => ({
  sendJobCompleteEmail: vi.fn()
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(),
  updateJobStatus: vi.fn()
}))

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(),
    ensureFile: vi.fn(),
    readFile: vi.fn(),
    promises: {
      writeFile: vi.fn()
    }
  }
}))

vi.mock('@bilbomd/mongodb-schema', async () => {
  const actual = await vi.importActual('@bilbomd/mongodb-schema')
  return {
    ...actual,
    User: {
      findById: vi.fn()
    }
  }
})

// Minimal fake CHARMM ChildProcess: an EventEmitter with a stdout emitter.
const makeCharmmChild = () => {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter }
  child.stdout = new EventEmitter()
  return child
}

describe('job-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initializeJob', () => {
    it('should initialize job successfully', async () => {
      const mockMQJob = {
        clearLogs: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob

      const mockDBJob = {
        status: 'Pending',
        time_started: undefined,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await initializeJob(mockMQJob, mockDBJob)

      expect(mockMQJob.clearLogs).toHaveBeenCalledTimes(1)
      expect(mockDBJob.status).toBe('Running')
      expect(mockDBJob.time_started).toBeInstanceOf(Date)
      expect(mockDBJob.save).toHaveBeenCalledTimes(1)
    })

    it('should log and throw error if initialization fails', async () => {
      const mockMQJob = {
        clearLogs: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob

      const mockDBJob = {
        status: 'Pending',
        save: vi.fn().mockRejectedValue(new Error('Database error'))
      } as unknown as IJob

      await expect(initializeJob(mockMQJob, mockDBJob)).rejects.toThrow('Database error')
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in initializeJob')
      )
    })
  })

  describe('cleanupJob', () => {
    it('should cleanup job with user and send email', async () => {
      const mockUser: IUser = {
        _id: new Types.ObjectId(),
        email: 'user@example.com',
        username: 'testuser'
      } as IUser

      const mockMQJob = {
        log: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob

      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'test-uuid',
        title: 'Test Job',
        user: mockUser,
        status: 'Running',
        time_completed: undefined,
        progress: 0,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      vi.mocked(config).sendEmailNotifications = true
      vi.mocked(config).bilbomdUrl = 'http://localhost:3000'

      await cleanupJob(mockMQJob, mockDBJob)

      expect(mockDBJob.status).toBe('Completed')
      expect(mockDBJob.time_completed).toBeInstanceOf(Date)
      expect(mockDBJob.save).toHaveBeenCalled()
      expect(updateStepStatus).toHaveBeenCalledWith(
        mockDBJob,
        'email',
        expect.objectContaining({ status: 'Running' })
      )
      expect(sendJobCompleteEmail).toHaveBeenCalledWith(
        'user@example.com',
        'http://localhost:3000',
        mockDBJob._id.toString(),
        'Test Job',
        false
      )
    })

    it('should cleanup job without user and skip email', async () => {
      const mockMQJob = {} as unknown as BullMQJob

      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'test-uuid-no-user',
        user: undefined,
        status: 'Running',
        time_completed: undefined,
        progress: 0,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await cleanupJob(mockMQJob, mockDBJob)

      expect(mockDBJob.status).toBe('Completed')
      expect(mockDBJob.progress).toBe(100)
      expect(mockDBJob.save).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('no user associated with job')
      )
      expect(sendJobCompleteEmail).not.toHaveBeenCalled()
    })

    it('should handle email sending errors gracefully', async () => {
      const mockUser: IUser = {
        _id: new Types.ObjectId(),
        email: 'user@example.com',
        username: 'testuser'
      } as IUser

      const mockMQJob = {
        log: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob

      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'test-uuid',
        title: 'Test Job',
        user: mockUser,
        status: 'Running',
        time_completed: undefined,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      vi.mocked(config).sendEmailNotifications = true
      vi.mocked(sendJobCompleteEmail).mockImplementation(() => {
        throw new Error('Email service unavailable')
      })

      await cleanupJob(mockMQJob, mockDBJob)

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send email')
      )
      expect(updateStepStatus).toHaveBeenCalledWith(
        mockDBJob,
        'email',
        expect.objectContaining({ status: 'Error' })
      )
    })

    it('should skip email if notifications are disabled', async () => {
      const mockUser: IUser = {
        _id: new Types.ObjectId(),
        email: 'user@example.com',
        username: 'testuser'
      } as IUser

      const mockMQJob = {} as unknown as BullMQJob

      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'test-uuid',
        user: mockUser,
        status: 'Running',
        time_completed: undefined,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      vi.mocked(config).sendEmailNotifications = false

      await cleanupJob(mockMQJob, mockDBJob)

      expect(sendJobCompleteEmail).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('email notifications disabled')
      )
    })

    it('should handle user lookup from ObjectId', async () => {
      const userId = new Types.ObjectId()
      const mockUser: IUser = {
        _id: userId,
        email: 'found@example.com',
        username: 'founduser'
      } as IUser

      const mockMQJob = {} as unknown as BullMQJob

      // User as string ObjectId (as it comes from MongoDB before population)
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'test-uuid',
        user: userId.toString(),
        status: 'Running',
        time_completed: undefined,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      vi.mocked(User.findById).mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockUser)
        })
      } as unknown as ReturnType<typeof User.findById>)

      vi.mocked(config).sendEmailNotifications = false

      await cleanupJob(mockMQJob, mockDBJob)

      expect(User.findById).toHaveBeenCalledWith(userId.toString())
      expect(mockDBJob.status).toBe('Completed')
    })
  })

  describe('makeDir', () => {
    it('should create directory and log', async () => {
      const directory = '/tmp/test-dir'

      await makeDir(directory)

      expect(fs.ensureDir).toHaveBeenCalledWith(directory)
      expect(logger.info).toHaveBeenCalledWith(`Create Dir: ${directory}`)
    })
  })

  describe('makeFile', () => {
    it('should ensure file exists', async () => {
      const file = '/tmp/test-file.txt'

      await makeFile(file)

      expect(fs.ensureFile).toHaveBeenCalledWith(file)
    })
  })

  describe('generateInputFile', () => {
    it('should generate input file from template', async () => {
      const mockParams = {
        charmm_template: 'minimize',
        charmm_inp_file: 'minimize.inp',
        out_dir: '/tmp/job-dir'
      }

      const mockTemplate = 'CHARMM input template with {{charmm_inp_file}}'

      vi.mocked(fs.readFile).mockResolvedValue(mockTemplate)
      vi.mocked(config).charmmTemplateDir = '/templates'

      await generateInputFile(mockParams)

      expect(fs.readFile).toHaveBeenCalledWith(
        '/templates/minimize.handlebars',
        'utf8'
      )
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        '/tmp/job-dir/minimize.inp',
        expect.any(String)
      )
    })

    it('should handle template read errors', async () => {
      const mockParams = {
        charmm_template: 'nonexistent',
        charmm_inp_file: 'test.inp',
        out_dir: '/tmp'
      }

      vi.mocked(fs.readFile).mockRejectedValue(new Error('Template not found'))
      vi.mocked(config).charmmTemplateDir = '/templates'

      await expect(generateInputFile(mockParams)).rejects.toThrow('Template not found')
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in readTemplate')
      )
    })
  })

  describe('handleError', () => {
    it('should handle Error objects and update job/step status', async () => {
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'error-test-uuid',
        title: 'Error Test Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob

      const error = new Error('Test error message')
      const step = 'minimize'

      await expect(handleError(error, mockDBJob, step)).rejects.toThrow(
        "BilboMD failed in step 'minimize': Test error message"
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('handleError - Error object details')
      )
      expect(updateJobStatus).toHaveBeenCalledWith(mockDBJob, 'Error')
      expect(updateStepStatus).toHaveBeenCalledWith(
        mockDBJob,
        'minimize',
        expect.objectContaining({
          status: 'Error',
          message: expect.stringContaining('Test error message')
        })
      )
    })

    it('should handle non-Error objects', async () => {
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'error-test-uuid',
        title: 'Error Test Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob

      const error = 'String error'
      const step = 'heat'

      await expect(handleError(error, mockDBJob, step)).rejects.toThrow(
        "BilboMD failed in step 'heat': String error"
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('handleError - Non-Error object')
      )
    })

    it('should handle errors without step information', async () => {
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'error-test-uuid',
        title: 'Error Test Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob

      const error = new Error('General error')

      await expect(handleError(error, mockDBJob)).rejects.toThrow(
        "BilboMD failed in step 'unknown': General error"
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Step not provided when handling error')
      )
      expect(updateJobStatus).toHaveBeenCalledWith(mockDBJob, 'Error')
      expect(updateStepStatus).not.toHaveBeenCalled()
    })

    it('should handle updateJobStatus failures gracefully', async () => {
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'error-test-uuid',
        title: 'Error Test Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob

      const error = new Error('Original error')
      vi.mocked(updateJobStatus).mockRejectedValue(new Error('Update failed'))

      await expect(handleError(error, mockDBJob, 'md')).rejects.toThrow(
        "BilboMD failed in step 'md': Original error"
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update job status')
      )
    })
  })

  describe('runPipelineStep', () => {
    it('logs start/end and runs the step function on success', async () => {
      const mockMQJob = {
        log: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'step-uuid'
      } as unknown as IJob
      const fn = vi.fn().mockResolvedValue(undefined)

      await runPipelineStep(mockMQJob, mockDBJob, 'md', 'md', fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(mockMQJob.log).toHaveBeenCalledWith('start md')
      expect(mockMQJob.log).toHaveBeenCalledWith('end md')
      expect(updateJobStatus).not.toHaveBeenCalled()
    })

    it('marks job + step as Error and re-throws when the step fails', async () => {
      vi.mocked(updateJobStatus).mockResolvedValue(undefined)
      const mockMQJob = {
        log: vi.fn().mockResolvedValue(undefined)
      } as unknown as BullMQJob
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'step-uuid',
        title: 'Step Test Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob
      const fn = vi.fn().mockRejectedValue(new Error('boom'))

      await expect(
        runPipelineStep(mockMQJob, mockDBJob, 'md', 'md', fn)
      ).rejects.toThrow("BilboMD failed in step 'md': boom")

      expect(updateJobStatus).toHaveBeenCalledWith(mockDBJob, 'Error')
      expect(updateStepStatus).toHaveBeenCalledWith(
        mockDBJob,
        'md',
        expect.objectContaining({ status: 'Error' })
      )
      // 'end md' must NOT be logged after a failure
      expect(mockMQJob.log).toHaveBeenCalledWith('start md')
      expect(mockMQJob.log).not.toHaveBeenCalledWith('end md')
    })
  })

  describe('fetchJobUser (via cleanupJob)', () => {
    it('treats an invalid ObjectId user reference as no user', async () => {
      const mockMQJob = {} as unknown as BullMQJob
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'bad-user-uuid',
        user: 'not-a-valid-object-id',
        status: 'Running',
        time_completed: undefined,
        progress: 0,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      await cleanupJob(mockMQJob, mockDBJob)

      expect(User.findById).not.toHaveBeenCalled()
      expect(mockDBJob.progress).toBe(100)
      expect(mockDBJob.status).toBe('Completed')
      expect(sendJobCompleteEmail).not.toHaveBeenCalled()
    })
  })

  describe('handleJobEmailNotification (via cleanupJob)', () => {
    it('skips email when the user has no email address', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        username: 'noemail'
      } as IUser
      const mockMQJob = { log: vi.fn() } as unknown as BullMQJob
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'no-email-uuid',
        user: mockUser,
        status: 'Running',
        time_completed: undefined,
        save: vi.fn().mockResolvedValue(undefined)
      } as unknown as IJob

      vi.mocked(config).sendEmailNotifications = true

      await cleanupJob(mockMQJob, mockDBJob)

      expect(sendJobCompleteEmail).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('user email is undefined')
      )
    })
  })

  describe('writeInputFile (via generateInputFile)', () => {
    it('logs and throws when writing the input file fails', async () => {
      const mockParams = {
        charmm_template: 'minimize',
        charmm_inp_file: 'minimize.inp',
        out_dir: '/tmp/job-dir'
      }

      vi.mocked(fs.readFile).mockResolvedValue('template {{charmm_inp_file}}')
      vi.mocked(fs.promises.writeFile).mockRejectedValue(new Error('EACCES'))
      vi.mocked(config).charmmTemplateDir = '/templates'

      await expect(generateInputFile(mockParams)).rejects.toThrow('EACCES')
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in writeInputFile')
      )
    })
  })

  describe('handleError (additional branches)', () => {
    it('logs but does not rethrow when updating the step status fails', async () => {
      const mockDBJob = {
        _id: new Types.ObjectId(),
        uuid: 'step-fail-uuid',
        title: 'Step Fail Job',
        __t: 'BilboMDPDBJob',
        status: 'Running'
      } as unknown as IJob

      vi.mocked(updateJobStatus).mockResolvedValue(undefined)
      vi.mocked(updateStepStatus).mockRejectedValue(new Error('step write failed'))

      await expect(handleError(new Error('boom'), mockDBJob, 'md')).rejects.toThrow(
        "BilboMD failed in step 'md': boom"
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update step status for step md')
      )
    })
  })

  describe('spawnCharmm', () => {
    const params = {
      charmm_inp_file: 'minimize.inp',
      charmm_out_file: 'minimize.out',
      out_dir: '/tmp/job-dir'
    }

    it('spawns CHARMM with the configured binary and args, resolving on close 0', async () => {
      const child = makeCharmmChild()
      spawnMock.mockReturnValue(child)
      vi.mocked(config).charmmBin = '/usr/local/bin/charmm'

      const p = spawnCharmm(params)
      child.emit('close', 0)

      await expect(p).resolves.toBeUndefined()
      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/local/bin/charmm',
        ['-o', 'minimize.out', '-i', 'minimize.inp'],
        { cwd: '/tmp/job-dir' }
      )
    })

    it('rejects with the accumulated stdout when CHARMM exits non-zero', async () => {
      const child = makeCharmmChild()
      spawnMock.mockReturnValue(child)

      const p = spawnCharmm(params)
      child.stdout.emit('data', Buffer.from('CHARMM> abnormal termination'))
      child.emit('close', 1)

      await expect(p).rejects.toThrow('CHARMM> abnormal termination')
    })

    it('rejects when the CHARMM process emits an error', async () => {
      const child = makeCharmmChild()
      spawnMock.mockReturnValue(child)

      const p = spawnCharmm(params)
      child.emit('error', new Error('ENOENT'))

      await expect(p).rejects.toThrow(/CHARMM process encountered an error: ENOENT/)
    })

    it('emits heartbeat progress updates while running when given an MQ job', async () => {
      vi.useFakeTimers()
      const child = makeCharmmChild()
      spawnMock.mockReturnValue(child)
      const MQjob = {
        updateProgress: vi.fn(),
        log: vi.fn()
      } as unknown as BullMQJob

      const p = spawnCharmm(params, MQjob)
      await vi.advanceTimersByTimeAsync(10_000)
      child.emit('close', 0)

      await expect(p).resolves.toBeUndefined()
      expect(MQjob.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      )
      expect(MQjob.log).toHaveBeenCalledWith(
        expect.stringContaining('Heartbeat')
      )
    })
  })
})
