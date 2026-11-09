import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDBioEmuJob,
  IStepStatus,
  Job,
  buildStepStatusUpdate
} from '@bilbomd/mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import { ProcessError, runProcess } from '../../helpers/runProcess.js'
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

/**
 * How many FoXS processes to run at once. FoXS is single-threaded and nothing
 * else runs during the step, so use every CPU the worker has; a cap of 80% cost
 * ~1.4x in the #1157 benchmark.
 */
const foxsConcurrency = (effectiveCpus: number, override?: number): number =>
  override && override > 0 ? override : Math.max(1, effectiveCpus)

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

interface FoxsTask {
  file: string
  dir: string
  fullPath: string
}

// Settings for the batched GPU FoXS path (config.foxsGpu)
interface FoxsGpuOptions {
  bin: string
  batchSize: number
  concurrency: number
}

type FoxsDBJob =
  | IBilboMDPDBJob
  | IBilboMDCRDJob
  | IBilboMDAutoJob
  | IBilboMDAlphaFoldJob
  | IBilboMDOpenFoldJob
  | IBilboMDBioEmuJob

const PROGRESS_EVERY = 50

// foxs-gpu exits 2 with this message when it can't use a GPU (no device, no
// driver, or a build without CUDA)
const GPU_UNAVAILABLE = 'Cannot use --gpu'

const isGpuUnavailable = (error: unknown): boolean =>
  error instanceof ProcessError &&
  error.result.code === 2 &&
  error.result.stderrTail.some((line) => line.includes(GPU_UNAVAILABLE))

const isCancelled = (error: unknown): boolean =>
  error instanceof ProcessError && error.result.aborted

/**
 * Splits tasks into batches of at most `size` files, never mixing
 * directories: foxs-gpu writes each profile next to its input (cwd-relative).
 */
const batchByDir = (tasks: FoxsTask[], size: number): FoxsTask[][] => {
  const byDir = new Map<string, FoxsTask[]>()
  for (const task of tasks) {
    const list = byDir.get(task.dir) ?? []
    list.push(task)
    byDir.set(task.dir, list)
  }
  // A size below 1 would never advance
  const step = Math.max(1, Math.floor(size))
  const batches: FoxsTask[][] = []
  for (const list of byDir.values()) {
    for (let i = 0; i < list.length; i += step) {
      batches.push(list.slice(i, i + step))
    }
  }
  return batches
}

/**
 * Runs FoXS on the GPU, `batchSize` PDBs per foxs-gpu call and `concurrency`
 * calls at once (#1157: ~8-10x faster than one IMP foxs call per file).
 * Returns the tasks it didn't finish, for the CPU path: everything once the
 * GPU turns out to be unavailable, and the files of any batch that failed or
 * didn't write its profiles. A cancelled job rethrows instead.
 */
const runFoXSOnGpu = async (
  tasks: FoxsTask[],
  gpu: FoxsGpuOptions,
  onDone: (count: number) => void
): Promise<FoxsTask[]> => {
  const batches = batchByDir(tasks, gpu.batchSize)
  logger.info(
    `FoXS on GPU: ${tasks.length} files in ${batches.length} batches of up to ${gpu.batchSize}, ${gpu.concurrency} at once (${gpu.bin})`
  )
  const limit = pLimit(Math.max(1, Math.floor(gpu.concurrency)))
  const leftovers: FoxsTask[] = []
  let gpuUnavailable = false

  const runBatch = async (batch: FoxsTask[]): Promise<void> => {
    if (gpuUnavailable) {
      leftovers.push(...batch)
      return
    }
    // A retried job reuses its FoXS directories: remove profiles left by an
    // earlier attempt so only ones this run writes count as done
    await Promise.all(batch.map((t) => fs.remove(`${t.fullPath}.dat`)))
    try {
      await runProcess({
        label: `FoXS GPU batch (${batch.length} files in ${path.basename(batch[0].dir)})`,
        cmd: gpu.bin,
        args: ['--gpu', '-p', ...batch.map((t) => t.file)],
        cwd: batch[0].dir,
        timeoutMs: config.processTimeouts.foxsMs
      })
    } catch (error) {
      if (isCancelled(error)) throw error
      if (isGpuUnavailable(error)) {
        if (!gpuUnavailable) {
          logger.warn(
            `GPU FoXS is unavailable, using CPU FoXS: ${getErrorMessage(error)}`
          )
        }
        gpuUnavailable = true
      } else {
        logger.warn(
          `GPU FoXS batch failed, retrying its ${batch.length} files on the CPU: ${getErrorMessage(error)}`
        )
      }
      leftovers.push(...batch)
      return
    }
    const missing = batch.filter((t) => !fs.existsSync(`${t.fullPath}.dat`))
    if (missing.length > 0) {
      logger.warn(
        `GPU FoXS wrote no profile for ${missing.length} of ${batch.length} files in ${batch[0].dir}; retrying them on the CPU`
      )
      leftovers.push(...missing)
    }
    onDone(batch.length - missing.length)
  }

  // Let every batch settle before rethrowing a cancel, so no foxs-gpu process
  // is still running when the job handler (or a job pod) exits
  const results = await Promise.allSettled(
    batches.map((batch) => limit(() => runBatch(batch)))
  )
  const failed = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  )
  if (failed) throw failed.reason
  return leftovers
}

/**
 * Optimized FoXS processing using p-limit for concurrency control.
 * Processes all PDB files across all directories in parallel with controlled
 * concurrency. With `gpu` set, the GPU path runs first and IMP's CPU foxs
 * handles whatever it leaves.
 */
const spawnFoXSOptimized = async (
  foxsRunDirs: string[],
  MQjob?: BullMQJob,
  maxConcurrency = getEffectiveCpuCount(),
  DBjob?: FoxsDBJob,
  gpu?: FoxsGpuOptions
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
      `Processing ${allTasks.length} PDB files across ${foxsRunDirs.length} directories${gpu ? ' (GPU first)' : ''} with ${maxConcurrency} concurrent CPU workers`
    )

    let completed = 0

    // Progress logging - report each time another 50 files are done
    const reportDone = (count: number) => {
      const before = completed
      completed += count
      if (
        !MQjob ||
        Math.floor(completed / PROGRESS_EVERY) ===
          Math.floor(before / PROGRESS_EVERY)
      ) {
        return
      }
      const progress = Math.round((completed / allTasks.length) * 100)
      const statusMsg = `FoXS: ${completed}/${allTasks.length} (${progress}%)`
      MQjob.updateProgress({
        status: statusMsg,
        timestamp: Date.now()
      })
      MQjob.log(
        `FoXS progress: ${completed}/${allTasks.length} files completed`
      )
      logger.info(
        `FoXS progress: ${completed}/${allTasks.length} files completed (${progress}%)`
      )
      if (DBjob) {
        void Job.findByIdAndUpdate(
          DBjob._id,
          buildStepStatusUpdate('foxs', {
            status: 'Running',
            message: statusMsg
          }),
          { updatePipeline: true }
        ).catch((err) => logger.error(`FoXS step status update failed: ${err}`))
      }
    }

    const cpuTasks = gpu
      ? await runFoXSOnGpu(allTasks, gpu, reportDone)
      : allTasks
    const gpuDone = allTasks.length - cpuTasks.length
    if (gpu) {
      logger.info(
        `FoXS on GPU finished ${gpuDone} of ${allTasks.length} files; ${cpuTasks.length} left for the CPU`
      )
    }

    // Process a single PDB file with FoXS
    const processSingleFile = async (task: FoxsTask): Promise<void> => {
      try {
        await runProcess({
          label: `FoXS ${task.file}`,
          cmd: config.foxBin,
          args: ['-p', task.file],
          cwd: task.dir,
          timeoutMs: config.processTimeouts.foxsMs
        })
      } catch (error) {
        logger.error(`FoXS failed in ${task.dir}: ${getErrorMessage(error)}`)
        throw error
      }
      reportDone(1)
    }

    // Execute all CPU tasks with concurrency limit
    const limit = pLimit(maxConcurrency)
    const results = await Promise.allSettled(
      cpuTasks.map((task) => limit(() => processSingleFile(task)))
    )

    // A cancelled job stops here rather than counting as failed files
    const cancelled = results.find(
      (r): r is PromiseRejectedResult =>
        r.status === 'rejected' && isCancelled(r.reason)
    )
    if (cancelled) throw cancelled.reason

    // Count successes and failures
    const failedCount = results.filter((r) => r.status === 'rejected').length
    const successful = gpuDone + (cpuTasks.length - failedCount)

    const summary = `FoXS processing completed: ${successful} successful (${gpuDone} on GPU), ${failedCount} failed out of ${allTasks.length} total files`
    logger.info(summary)
    if (MQjob) {
      MQjob.log(summary)
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
const prepareFoXSInputs = async (DBjob: FoxsDBJob): Promise<string[]> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const foxsDir = path.join(jobDir, 'foxs')
  const mdDir = path.join(jobDir, 'openmm', 'md') // OpenMM structure
  const charmmMdDir = path.join(jobDir, 'charmm', 'md') // CHARMM structure

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

  // 2) If none found, look for OpenMM md/rg_* directories OR CHARMM charmm/md/rg_* directories and mirror them into foxs via symlinks
  let mdSubDirs = listDirs(mdDir).filter(hasPdbs) // OpenMM structure
  let sourceMdDir = mdDir

  // If no OpenMM directories found, try CHARMM structure
  if (mdSubDirs.length === 0) {
    mdSubDirs = listDirs(charmmMdDir).filter(hasPdbs) // CHARMM structure
    sourceMdDir = charmmMdDir
  }

  if (mdSubDirs.length === 0) {
    logger.warn(
      'No PDB files found in foxs/, openmm/md/, or charmm/md/ directories'
    )
    return []
  }

  const mdStructureType = sourceMdDir === mdDir ? 'OpenMM' : 'CHARMM'
  logger.info(
    `Found ${mdSubDirs.length} MD directories with PDB files in ${mdStructureType} structure (${sourceMdDir}), creating FoXS mirrors`
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
 * The GPU path's settings when FOXS_GPU=auto and foxs-gpu is installed;
 * undefined means CPU FoXS only.
 */
const foxsGpuOptions = (): FoxsGpuOptions | undefined => {
  const { mode, bin, batchSize, concurrency } = config.foxsGpu
  if (mode === 'off') return undefined
  if (!fs.existsSync(bin)) {
    logger.warn(`FOXS_GPU=${mode} but ${bin} doesn't exist; using CPU FoXS`)
    return undefined
  }
  return { bin, batchSize, concurrency }
}

/**
 * Main FoXS processing function with optimized concurrency.
 * Uses p-limit to process all PDB files across all directories in parallel.
 */
const runFoXS = async (
  MQjob: BullMQJob,
  DBjob: FoxsDBJob,
  maxConcurrency?: number
): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'FoXS Calculations have started.'
  }
  let heartbeat: NodeJS.Timeout | null = null

  try {
    logger.info(`Starting FoXS for job ${DBjob.uuid}`)
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
    const actualConcurrency = foxsConcurrency(effectiveCpus, maxConcurrency)
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
    await spawnFoXSOptimized(
      foxsRunDirs,
      MQjob,
      actualConcurrency,
      DBjob,
      foxsGpuOptions()
    )

    // Update status to Success once all jobs are complete
    status = {
      status: 'Success',
      message: 'FoXS Calculations have completed successfully.'
    }
    await updateStepStatus(DBjob, 'foxs', status)
    logger.info(`Completed FoXS for job ${DBjob.uuid}`)
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

export {
  batchByDir,
  foxsConcurrency,
  foxsGpuOptions,
  runFoXS,
  spawnFoXSOptimized
}
