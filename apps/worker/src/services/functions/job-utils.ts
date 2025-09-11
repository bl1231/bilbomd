import { User, IUser, IJob, IStepStatus } from '@bl1231/bilbomd-mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../helpers/loggers.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { config } from '../../config/config.js'
import fs from 'fs-extra'
import { CharmmDCD2PDBParams, CharmmParams } from '../../types/index.js'
import path from 'path'
import { spawn, ChildProcess } from 'node:child_process'
import Handlebars from 'handlebars'
import { updateStepStatus } from './mongo-utils.js'

const initializeJob = async (MQJob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    // Make sure the user exists in MongoDB
    const foundUser = await User.findById(DBjob.user).lean().exec()
    if (!foundUser) {
      throw new Error(`No user found for: ${DBjob.uuid}`)
    }

    // Clear the BullMQ Job logs in the case this job is being re-run
    await MQJob.clearLogs()

    // Set MongoDB status to Running when we are submitting to Slurm at NERSC
    // Does this need to be set to Running when we are running locally?6
    DBjob.status = 'Running'
    // DBjob.time_started = new Date()
    await DBjob.save()
  } catch (error) {
    // Handle and log the error
    logger.error(`Error in initializeJob: ${error}`)
    throw error
  }
}

const cleanupJob = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    // Mark job as completed in the database
    await markJobAsCompleted(DBjob)

    // Fetch user associated with the job
    const user = await fetchJobUser(DBjob)
    if (!user) {
      logger.error(`No user found for: ${DBjob.uuid}`)
      return
    }

    // Handle email notifications
    await handleJobEmailNotification(MQjob, DBjob, user)
  } catch (error) {
    logger.error(`Error in cleanupJob: ${error}`)
    throw error
  }
}

// Mark job as completed
const markJobAsCompleted = async (DBjob: IJob): Promise<void> => {
  DBjob.status = 'Completed'
  DBjob.time_completed = new Date()
  await DBjob.save()
}

// Fetch user associated with the job
const fetchJobUser = async (DBjob: IJob): Promise<IUser | null> => {
  return User.findById(DBjob.user).lean<IUser>().exec()
}

// Handle email notifications
const handleJobEmailNotification = async (
  MQjob: BullMQJob,
  DBjob: IJob,
  user: IUser
): Promise<void> => {
  if (config.sendEmailNotifications) {
    let status: IStepStatus = {
      status: 'Running',
      message: `Sending email to: ${user.email}`
    }
    await updateStepStatus(DBjob, 'email', status)

    try {
      sendJobCompleteEmail(user.email, config.bilbomdUrl, DBjob.id, DBjob.title, false)
      logger.info(`Email notification sent to ${user.email}`)
      await MQjob.log(`Email notification sent to ${user.email}`)

      status = {
        status: 'Success',
        message: `Email sent to: ${user.email}`
      }
      await updateStepStatus(DBjob, 'email', status)
    } catch (emailError) {
      logger.error(`Failed to send email to ${user.email}: ${emailError.message}`)
      status = {
        status: 'Error',
        message: `Failed to send email: ${emailError.message}`
      }
      await updateStepStatus(DBjob, 'email', status)
    }
  } else {
    logger.info(`Skipping email notification for ${user.email}`)
  }
}

const makeDir = async (directory: string) => {
  await fs.ensureDir(directory)
  logger.info(`Create Dir: ${directory}`)
}

const makeFile = async (file: string) => {
  await fs.ensureFile(file)
}

const generateDCD2PDBInpFile = async (
  params: CharmmDCD2PDBParams,
  rg: number,
  run: number
) => {
  params.in_dcd = `dynamics_rg${rg}_run${run}.dcd`
  await generateInputFile(params)
}

const writeInputFile = async (template: string, params: CharmmParams): Promise<void> => {
  try {
    const outFile = path.join(params.out_dir, params.charmm_inp_file)
    const templ = Handlebars.compile(template)
    const content = templ(params)

    logger.info(`Write Input File: ${outFile}`)
    await fs.promises.writeFile(outFile, content)
  } catch (error) {
    logger.error(`Error in writeInputFile: ${error}`)
    throw error
  }
}

const readTemplate = async (templateName: string): Promise<string> => {
  const templateFile = path.join(config.charmmTemplateDir, `${templateName}.handlebars`)
  return fs.readFile(templateFile, 'utf8')
}

const generateInputFile = async (params: CharmmParams): Promise<void> => {
  const templateString = await readTemplate(params.charmm_template)
  await writeInputFile(templateString, params)
}

const spawnCharmm = (params: CharmmParams, MQjob: BullMQJob): Promise<void> => {
  const { charmm_inp_file: inputFile, charmm_out_file: outputFile, out_dir } = params
  const charmmArgs = ['-o', outputFile, '-i', inputFile]
  const charmmOpts = { cwd: out_dir }

  return new Promise<void>((resolve, reject) => {
    const charmm: ChildProcess = spawn(config.charmmBin, charmmArgs, charmmOpts)
    let charmmOutput = ''
    let heartbeat: NodeJS.Timeout | null = null

    // Start a heartbeat timer (e.g., every 20 seconds)
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: still running ${inputFile}`)
        logger.info(
          `CHARMM Heartbeat: still running ${inputFile} at ${new Date().toLocaleString(
            'en-US',
            { timeZone: 'America/Los_Angeles' }
          )}`
        )
      }, 10_000)
    }

    charmm.stdout?.on('data', (data) => {
      charmmOutput += data.toString()
    })

    charmm.on('error', (error) => {
      if (heartbeat) clearInterval(heartbeat)
      reject(new Error(`CHARMM process encountered an error: ${error.message}`))
    })

    charmm.on('close', (code: number) => {
      if (heartbeat) clearInterval(heartbeat)
      if (code === 0) {
        logger.info(`CHARMM success: ${inputFile} exit code: ${code}`)
        resolve()
      } else {
        logger.info(`CHARMM error: ${inputFile} exit code: ${code}`)
        reject(new Error(charmmOutput))
      }
    })
  })
}

const spawnFoXS = async (foxsRunDir: string, MQjob: BullMQJob): Promise<void> => {
  try {
    const files = await fs.readdir(foxsRunDir)
    logger.info(`Spawn FoXS jobs: ${foxsRunDir}`)
    const foxsOpts = { cwd: foxsRunDir }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      await new Promise<void>((resolve, reject) => {
        const foxsArgs = ['-p', file]
        const foxs: ChildProcess = spawn(config.foxBin, foxsArgs, foxsOpts)

        foxs.on('exit', (code) => {
          if (code === 0) {
            // Log every N files
            if (MQjob && i % 20 === 0) {
              MQjob.updateProgress({
                status: `FoXS processing: ${i + 1}/${files.length}`,
                timestamp: Date.now()
              })
              MQjob.log(`FoXS progress: ${i + 1}/${files.length}`)
              logger.info(`FoXS progress: ${i + 1}/${files.length}`)
            }
            resolve()
          } else {
            reject(new Error(`FoXS process for ${file} exited with code ${code}`))
          }
        })

        foxs.on('error', (error) => {
          reject(new Error(`FoXS process error for ${file}: ${error.message}`))
        })
      })
    }
  } catch (error) {
    logger.error(`FoXS error in ${foxsRunDir}: ${error}`)
    throw error
  }
}

export {
  initializeJob,
  cleanupJob,
  makeDir,
  makeFile,
  generateDCD2PDBInpFile,
  generateInputFile,
  spawnCharmm,
  spawnFoXS
}
