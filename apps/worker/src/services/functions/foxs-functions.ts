import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IStepStatus
} from '@bilbomd/mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import { spawn, ChildProcess } from 'node:child_process'
import { config } from '../../config/config.js'
import { logger } from '../../helpers/loggers.js'
import { updateStepStatus } from './mongo-utils.js'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import pLimit from 'p-limit'

/**
 * Constants
 */
const FOXS_HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds

/**
 * Get the effective number of CPU cores available to this process.
 * Considers Docker CPU limits if running in a container.
 * Can be overridden with FOXS_MAX_CPUS environment variable.
 */
const getEffectiveCpuCount = (): number => {
  // Allow manual override via environment variable
  const envCpus = process.env.FOXS_MAX_CPUS
  if (envCpus) {
    const parsedCpus = parseInt(envCpus, 10)
    if (parsedCpus > 0) {
      logger.info(`Using environment-specified CPU count: ${parsedCpus} cores`)
      return parsedCpus
    }
  }
  try {
    // Try to read Docker CPU quota (cgroup v1)
    const quotaPath = '/sys/fs/cgroup/cpu/cpu.cfs_quota_us'
    const periodPath = '/sys/fs/cgroup/cpu/cpu.cfs_period_us'

    if (fs.existsSync(quotaPath) && fs.existsSync(periodPath)) {
      const quota = parseInt(fs.readFileSync(quotaPath, 'utf8').trim())
      const period = parseInt(fs.readFileSync(periodPath, 'utf8').trim())

      if (quota > 0 && period > 0) {
        const dockerCpus = Math.floor(quota / period)
        if (dockerCpus > 0) {
          logger.info(`Detected Docker CPU limit: ${dockerCpus} cores`)
          return dockerCpus
        }
      }
    }

    // Try cgroup v2
    const cgroupV2Path = '/sys/fs/cgroup/cpu.max'
    if (fs.existsSync(cgroupV2Path)) {
      const content = fs.readFileSync(cgroupV2Path, 'utf8').trim()
      const [quotaStr, periodStr] = content.split(' ')

      if (quotaStr !== 'max' && periodStr) {
        const quota = parseInt(quotaStr)
        const period = parseInt(periodStr)

        if (quota > 0 && period > 0) {
          const dockerCpus = Math.floor(quota / period)
          if (dockerCpus > 0) {
            logger.info(
              `Detected Docker CPU limit (cgroup v2): ${dockerCpus} cores`
            )
            return dockerCpus
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`Could not read Docker CPU limits: ${getErrorMessage(error)}`)
  }

  // Fall back to host CPU count
  const hostCpus = os.cpus().length
  logger.info(`Using host CPU count: ${hostCpus} cores`)
  return hostCpus
}

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

interface FoxsTask {
  file: string
  dir: string
  fullPath: string
}

/**
 * Optimized FoXS processing using p-limit for concurrency control.
 * Processes all PDB files across all directories in parallel with controlled concurrency.
 */
const spawnFoXSOptimized = async (
  foxsRunDirs: string[],
  MQjob?: BullMQJob,
  maxConcurrency = getEffectiveCpuCount()
): Promise<void> => {
  try {
    // Collect all PDB files from all directories
    const allTasks: FoxsTask[] = []

    for (const dir of foxsRunDirs) {
      try {
        const files = await fs.readdir(dir)
        const pdbFiles = files.filter((f) => f.toLowerCase().endsWith('.pdb'))

        for (const file of pdbFiles) {
          allTasks.push({
            file,
            dir,
            fullPath: path.join(dir, file)
          })
        }
      } catch (error) {
        logger.warn(
          `Could not read directory ${dir}: ${getErrorMessage(error)}`
        )
      }
    }

    if (allTasks.length === 0) {
      logger.warn('No PDB files found in any FoXS directories')
      return
    }

    logger.info(
      `Processing ${allTasks.length} PDB files across ${foxsRunDirs.length} directories with ${maxConcurrency} concurrent workers`
    )

    // Create concurrency limiter
    const limit = pLimit(maxConcurrency)
    let completed = 0

    // Process a single PDB file with FoXS
    const processSingleFile = async (task: FoxsTask): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const foxsArgs = ['-p', task.file]
        const foxsOpts = { cwd: task.dir }
        const foxs: ChildProcess = spawn(config.foxBin, foxsArgs, foxsOpts)

        foxs.on('exit', (code) => {
          if (code === 0) {
            completed++

            // Progress logging - report every 50 completed files
            if (MQjob && completed % 50 === 0) {
              const progress = Math.round((completed / allTasks.length) * 100)
              MQjob.updateProgress({
                status: `FoXS processing: ${completed}/${allTasks.length} (${progress}%)`,
                timestamp: Date.now()
              })
              MQjob.log(
                `FoXS progress: ${completed}/${allTasks.length} files completed`
              )
              logger.info(
                `FoXS progress: ${completed}/${allTasks.length} files completed (${progress}%)`
              )
            }

            resolve()
          } else {
            const errorMsg = `FoXS process for ${task.file} in ${task.dir} exited with code ${code}`
            logger.error(errorMsg)
            reject(new Error(errorMsg))
          }
        })

        foxs.on('error', (error) => {
          const errorMsg = `FoXS process error for ${task.file}: ${error.message}`
          logger.error(errorMsg)
          reject(new Error(errorMsg))
        })
      })
    }

    // Execute all tasks with concurrency limit
    const limitedTasks = allTasks.map((task) =>
      limit(() => processSingleFile(task))
    )

    // Wait for all tasks to complete
    const results = await Promise.allSettled(limitedTasks)

    // Count successes and failures
    const successful = results.filter(
      (result) => result.status === 'fulfilled'
    ).length
    const failedCount = results.filter(
      (result) => result.status === 'rejected'
    ).length

    logger.info(
      `FoXS processing completed: ${successful} successful, ${failedCount} failed out of ${allTasks.length} total files`
    )

    if (MQjob) {
      MQjob.log(
        `FoXS processing completed: ${successful} successful, ${failedCount} failed out of ${allTasks.length} total files`
      )
    }

    // If there are failures but some successes, log warnings but don't throw
    if (failedCount > 0 && successful > 0) {
      logger.warn(
        `${failedCount} FoXS processes failed, but ${successful} succeeded`
      )
    } else if (failedCount > 0 && successful === 0) {
      throw new Error(`All ${failedCount} FoXS processes failed`)
    }
  } catch (error) {
    logger.error(`FoXS optimization error: ${getErrorMessage(error)}`)
    throw error
  }
}

/**
 * Prepare FoXS input directories by discovering existing foxs/ directories
 * or mirroring from OpenMM md/ directories via symlinks.
 */
const prepareFoXSInputs = async (
  DBjob:
    | IBilboMDPDBJob
    | IBilboMDCRDJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob
): Promise<string[]> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const foxsDir = path.join(jobDir, 'foxs')
  const mdDir = path.join(jobDir, 'md')

  const listDirs = (base: string): string[] => {
    if (!fs.existsSync(base)) return []
    return fs
      .readdirSync(base)
      .map((name) => path.join(base, name))
      .filter(
        (fullPath) =>
          fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()
      )
  }

  const hasPdbs = (dir: string): boolean => {
    try {
      const files = fs.readdirSync(dir)
      return files.some((f) => f.toLowerCase().endsWith('.pdb'))
    } catch {
      return false
    }
  }

  // 1) Prefer already-prepared foxs/rg_* directories containing PDB files
  const foxsSubDirs = listDirs(foxsDir).filter(hasPdbs)
  if (foxsSubDirs.length > 0) {
    logger.info(
      `Found ${foxsSubDirs.length} existing FoXS directories with PDB files`
    )
    return foxsSubDirs
  }

  // 2) If none found, look for OpenMM md/rg_* directories and mirror them into foxs via symlinks
  const mdSubDirs = listDirs(mdDir).filter(hasPdbs)
  if (mdSubDirs.length === 0) {
    logger.warn('No PDB files found in either foxs/ or md/ directories')
    return []
  }

  logger.info(
    `Found ${mdSubDirs.length} MD directories with PDB files, creating FoXS mirrors`
  )

  // Ensure foxs directory exists
  await fs.ensureDir(foxsDir)

  const mirroredFoxsDirs: string[] = []
  for (const srcDir of mdSubDirs) {
    const baseName = path.basename(srcDir) // e.g., 'rg_27'

    // Validate and normalize directory name - expect format 'rg_<number>'
    let normalizedName: string
    const rgMatch = baseName.match(/^rg_(\d+)$/)
    if (rgMatch) {
      // Expected format: 'rg_27' -> 'rg27'
      normalizedName = `rg${rgMatch[1]}`
    } else {
      // Fallback: use original name but log a warning
      logger.warn(
        `Unexpected directory name format: ${baseName}. Expected 'rg_<number>'. Using original name.`
      )
      normalizedName = baseName
    }

    const destDir = path.join(foxsDir, normalizedName)
    await fs.ensureDir(destDir)

    // Symlink all .pdb files from md/rg_* into foxs/rg*
    const entries = fs.readdirSync(srcDir)
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.pdb')) continue
      if (entry.toLowerCase() === 'md.pdb') continue

      const src = path.join(srcDir, entry)
      const dst = path.join(destDir, entry)

      try {
        // Use relative symlinks when possible
        if (!fs.existsSync(dst)) {
          const rel = path.relative(path.dirname(dst), src)
          await fs.ensureSymlink(rel, dst)
        }
      } catch (error: unknown) {
        // If symlink fails (e.g., on some filesystems), fall back to copying
        logger.warn(
          `Symlink failed, copying file instead: ${getErrorMessage(error)}`
        )
        if (!fs.existsSync(dst)) {
          await fs.copy(src, dst)
        }
      }
    }

    if (hasPdbs(destDir)) {
      mirroredFoxsDirs.push(destDir)
    }
  }

  logger.info(`Created ${mirroredFoxsDirs.length} mirrored FoXS directories`)
  return mirroredFoxsDirs
}

/**
 * Main FoXS processing function with optimized concurrency.
 * Uses p-limit to process all PDB files across all directories in parallel.
 */
const runFoXS = async (
  MQjob: BullMQJob,
  DBjob:
    | IBilboMDPDBJob
    | IBilboMDCRDJob
    | IBilboMDAutoJob
    | IBilboMDAlphaFoldJob,
  maxConcurrency?: number
): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'FoXS Calculations have started.'
  }
  let heartbeat: NodeJS.Timeout | null = null

  try {
    // Update the initial status
    await updateStepStatus(DBjob, 'foxs', status)

    // Discover or prepare FoXS input directories (supports OpenMM md/rg_* layout)
    const foxsRunDirs = await prepareFoXSInputs(DBjob)
    if (foxsRunDirs.length === 0) {
      throw new Error(
        'No FoXS input directories with PDB files were found under foxs/ or md/.'
      )
    }

    // Determine optimal concurrency
    const effectiveCpus = getEffectiveCpuCount()
    const actualConcurrency =
      maxConcurrency || Math.max(1, Math.floor(effectiveCpus * 0.8))
    logger.info(
      `Using ${actualConcurrency} concurrent FoXS workers (${effectiveCpus} effective CPUs available, ${os.cpus().length} host CPUs)`
    )

    // Set up the heartbeat for monitoring (reduced frequency since we have more granular progress)
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: FoXS processing still running`)
        logger.info(
          `runFoXS Heartbeat: still running FoXS for: ${
            DBjob.title
          } at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
        )
      }, FOXS_HEARTBEAT_INTERVAL_MS)
    }

    // Run optimized FoXS processing - ALL FILES IN PARALLEL
    await spawnFoXSOptimized(foxsRunDirs, MQjob, actualConcurrency)

    // Update status to Success once all jobs are complete
    status = {
      status: 'Success',
      message: 'FoXS Calculations have completed successfully.'
    }
    await updateStepStatus(DBjob, 'foxs', status)
    logger.info(
      `FoXS processing completed successfully for job: ${DBjob.title}`
    )
  } catch (error: unknown) {
    // Handle errors and update status to Error
    status = {
      status: 'Error',
      message: `Error in FoXS Calculations: ${getErrorMessage(error)}`
    }
    await updateStepStatus(DBjob, 'foxs', status)
    logger.error(`FoXS calculations failed: ${getErrorMessage(error)}`)
    throw error
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

export { runFoXS }
