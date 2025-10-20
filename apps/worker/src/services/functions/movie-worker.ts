import { logger } from '../../helpers/loggers.js'
import { spawn } from 'node:child_process'
import fs from 'fs-extra'
import path from 'path'
import { Job as BullMQJob } from 'bullmq'

const runGenerateMovies = async (MQjob: BullMQJob): Promise<void> => {
  const data = MQjob.data as MovieJobData
  const {
    jobId,
    label,
    pdb,
    dcd,
    outDir,
    stride,
    width,
    height,
    crf,
    rayEnabled
  } = data

  logger.debug(`[movie-worker] start jobId=${jobId} label=${label}`)
  await fs.ensureDir(outDir)

  const outMp4 = path.join(outDir, 'movie.mp4')
  const poster = path.join(outDir, 'poster.jpg')
  const thumb = path.join(outDir, 'thumb.gif')

  // Idempotency: skip if mp4 already exists
  if (await fs.pathExists(outMp4)) {
    logger.info(`[movie-worker] skip ${label}: already exists at ${outMp4}`)
    return
  }

  await generateMovieFromDCD({
    jobId,
    label,
    pdb,
    dcd,
    outDir,
    stride,
    width,
    height,
    crf,
    rayEnabled
  })

  // Optionally generate poster/thumbnail here after success
  try {
    // poster from first frame of video
    await fs.remove(poster).catch(() => {})
    await fs.remove(thumb).catch(() => {})
    await spawnPromise(
      'ffmpeg',
      ['-y', '-i', outMp4, '-vf', `scale=${width}:-1`, poster],
      outDir
    )

    await spawnPromise(
      'ffmpeg',
      [
        '-y',
        '-i',
        outMp4,
        '-vf',
        'fps=10,scale=480:-1:flags=lanczos',
        '-t',
        '4',
        thumb
      ],
      outDir
    )

    logger.info(`[movie-worker] poster/thumb generated for ${label}`)
  } catch (e) {
    logger.warn(
      `[movie-worker] poster/thumb generation failed for ${label}: ${e}`
    )
  }

  logger.debug(`[movie-worker] done jobId=${jobId} label=${label}`)
}

const generateMovieFromDCD = async (payload: MovieJobData): Promise<void> => {
  const { label, pdb, dcd, outDir, width, height, stride, crf, rayEnabled } =
    payload

  // Validate inputs exist
  if (!(await fs.pathExists(pdb))) {
    throw new Error(`[movie-worker] PDB not found: ${pdb}`)
  }
  if (!(await fs.pathExists(dcd))) {
    throw new Error(`[movie-worker] DCD not found: ${dcd}`)
  }
  await fs.ensureDir(outDir)

  const logFile = path.join(outDir, `movie_${label}.log`)
  const errorFile = path.join(outDir, `movie_${label}_error.log`)
  const outMp4 = path.join(outDir, 'movie.mp4')

  const movieScript = '/app/scripts/pymol/make_dcd_movie.py'

  // Build PyMOL command arguments using absolute paths
  const pymolArgs = [
    '-cqr',
    movieScript,
    '--',
    '--pdb',
    pdb,
    '--dcd',
    dcd,
    '--out',
    outMp4,
    '--stride',
    String(stride),
    '--viewport',
    '--align-ca',
    '--orient',
    'principal',
    '--clip'
  ]
  if (rayEnabled) {
    pymolArgs.push('--ray')
  }
  // Width/height/crf are respected by our script during ffmpeg stage
  pymolArgs.push(
    '--width',
    String(width),
    '--height',
    String(height),
    '--crf',
    String(crf)
  )

  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)

  logger.debug(`[movie-worker] spawning PyMOL for ${label}`)
  logger.debug(`[movie-worker] cmd: python -m pymol ${pymolArgs.join(' ')}`)
  logger.debug(`[movie-worker] cwd: ${outDir}`)

  return new Promise((resolve, reject) => {
    const pythonBinary = '/opt/envs/openmm/bin/python'
    const pymolCommand = ['-m', 'pymol'].concat(pymolArgs)

    const child = spawn(pythonBinary, pymolCommand, {
      cwd: outDir,
      env: {
        ...process.env,
        PATH: `/opt/envs/openmm/bin:${process.env.PATH || ''}`
      }
    })

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      logger.debug(`PyMOL stdout (${label}): ${output.trim()}`)
      logStream.write(output)
    })
    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      logger.debug(`PyMOL stderr (${label}): ${output.trim()}`)
      errorStream.write(output)
    })

    child.on('error', (error: Error) => {
      logger.error(`[movie-worker] spawn error (${label}): ${error}`)
      logStream.end()
      errorStream.end()
      reject(error)
    })

    child.on('exit', (code: number | null, signal: string | null) => {
      logStream.end()
      errorStream.end()

      if (code === 0) {
        logger.info(`[movie-worker] movie generated (${label}) -> ${outMp4}`)
        resolve()
      } else {
        logger.error(
          `[movie-worker] movie generation failed (${label}) code=${code} signal=${signal}`
        )
        reject(new Error(`movie generation failed with exit code ${code}`))
      }
    })
  })
}

function spawnPromise(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
  })
}

export { runGenerateMovies }
