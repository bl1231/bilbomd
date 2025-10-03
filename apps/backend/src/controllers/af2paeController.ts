import { logger } from '../middleware/loggers.js'
import multer from 'multer'
import fs from 'fs-extra'
import path from 'path'
import { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { User } from '@bilbomd/mongodb-schema'
import { spawn } from 'node:child_process'

const uploadFolder: string = process.env.DATA_VOL ?? '/bilbomd/uploads'

// New helper function: Adapted from spawnPaeToConst in the worker app.
// Directly spawns pae2const.py with --pdb_file (no CRD needed).
const spawnPaeToConstDirect = async (params: {
  in_pdb: string
  in_pae: string
  out_dir: string
  pae_power?: number
  plddt_cutoff?: number
}): Promise<void> => {
  // Ensure output dir exists
  fs.mkdirSync(params.out_dir, { recursive: true })

  const logFile = path.join(params.out_dir, 'af2pae.log')
  const errorFile = path.join(params.out_dir, 'af2pae_error.log')
  const logStream = fs.createWriteStream(logFile, { flags: 'a' })
  const errorStream = fs.createWriteStream(errorFile, { flags: 'a' })

  const pythonBin = '/miniforge3/bin/python'
  const af2paeScript = '/app/scripts/pae2const.py'

  // Build args: pae_file is positional, then --pdb_file
  const args = [af2paeScript, params.in_pae, '--pdb_file', params.in_pdb]
  if (params.pae_power !== undefined) {
    args.push('--pae_power', String(params.pae_power))
  }
  if (params.plddt_cutoff !== undefined) {
    args.push('--plddt_cutoff', String(params.plddt_cutoff))
  }

  const opts = { cwd: params.out_dir }

  return new Promise((resolve, reject) => {
    const runPaeToConst = spawn(pythonBin, args, opts)

    runPaeToConst.stdout?.on('data', (data) => {
      const s = data.toString()
      logger.info(`spawnPaeToConstDirect stdout: ${s}`)
      logStream.write(s)
    })

    runPaeToConst.stderr?.on('data', (data) => {
      const s = data.toString()
      logger.error(`spawnPaeToConstDirect stderr: ${s}`)
      errorStream.write(s)
    })

    runPaeToConst.on('error', (error) => {
      logger.error(`spawnPaeToConstDirect error: ${error}`)
      Promise.all([
        new Promise((r) => logStream.end(r)),
        new Promise((r) => errorStream.end(r))
      ]).finally(() => reject(error))
    })

    runPaeToConst.on('exit', (code: number) => {
      Promise.all([
        new Promise((r) => logStream.end(r)),
        new Promise((r) => errorStream.end(r))
      ])
        .then(() => {
          if (code === 0) {
            logger.info(`spawnPaeToConstDirect success, exit code: ${code}`)
            resolve()
          } else {
            logger.error(`spawnPaeToConstDirect failed, exit code: ${code}`)
            reject(new Error('PAE to const conversion failed. Check logs.'))
          }
        })
        .catch((streamError) => {
          logger.error(`Error closing streams: ${streamError}`)
          reject(streamError)
        })
    })
  })
}

const createNewConstFile = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, UUID)

  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Created Directory: ${jobDir}`)

    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, jobDir)
      },
      filename: function (req, file, cb) {
        if (file.fieldname === 'pae_file') {
          cb(null, 'pae.json') // Force standard filename
        } else {
          cb(null, file.originalname.toLowerCase())
        }
      }
    })

    const upload = multer({ storage: storage })

    upload.fields([
      { name: 'pdb_file', maxCount: 1 },
      { name: 'pae_file', maxCount: 1 },
      { name: 'pae_power', maxCount: 1 },
      { name: 'plddt_cutoff', maxCount: 1 }
    ])(req, res, async (err) => {
      if (err) {
        logger.error(err)
        return res
          .status(500)
          .json({ message: 'Failed to upload one or more files' })
      }

      try {
        const { pae_power, plddt_cutoff } = req.body
        const email = req.email
        const user = await User.findOne({ email }).exec()
        if (!user) {
          return res
            .status(401)
            .json({ message: 'No user found with that email' })
        }

        const files = req.files as {
          [fieldname: string]: Express.Multer.File[]
        }
        const pdbFile = files['pdb_file']?.[0]
        const paeFile = files['pae_file']?.[0]
        if (!pdbFile || !paeFile) {
          return res
            .status(400)
            .json({ message: 'PDB and PAE files are required' })
        }

        const pdbFilePath = path.join(jobDir, pdbFile.filename)
        const paeFilePath = path.join(jobDir, paeFile.filename)

        // Directly run PAE to const conversion
        await spawnPaeToConstDirect({
          in_pdb: pdbFilePath,
          in_pae: paeFilePath,
          out_dir: jobDir,
          pae_power: pae_power ? parseFloat(pae_power) : undefined,
          plddt_cutoff: plddt_cutoff ? parseFloat(plddt_cutoff) : undefined
        })

        logger.info(`PAE to const conversion completed for UUID: ${UUID}`)
        res.status(200).json({
          message: 'PAE job completed successfully',
          uuid: UUID
        })
      } catch (error) {
        logger.error(`Error during PAE conversion: ${error}`)
        res.status(500).json({ message: 'Error processing PAE to const' })
      }
    })
  } catch (error) {
    logger.error(`Failed to create job directory: ${error}`)
    res.status(500).json({ message: 'Failed to create job directory' })
  }
}

const getAf2PaeStatus = async (req: Request, res: Response) => {
  const { uuid } = req.query
  if (typeof uuid !== 'string') {
    return res.status(400).json({ message: 'Missing uuid' })
  }

  const constFile = path.join(uploadFolder, uuid, 'const.inp')
  try {
    // Check if const.inp exists (indicates successful processing)
    await fs.promises.access(constFile)
    return res.status(200).json({
      uuid,
      status: 'completed' // File exists, so job is done
    })
  } catch (error) {
    // File doesn't exist or access error
    logger.warn(`const.inp not found for UUID ${uuid}: ${error}`)
    return res.status(404).json({
      uuid,
      status: 'not found' // Treat as incomplete/failed
    })
  }
}

const downloadConstFile = async (req: Request, res: Response) => {
  const { uuid } = req.query
  // Check if uuid is provided
  if (!uuid || typeof uuid !== 'string') {
    res.status(400).json({ message: 'Job UUID required.' })
    return // Stop execution if uuid is missing or invalid
  }
  logger.info(`Request to download ${uuid}`)
  if (!uuid) {
    res.status(400).json({ message: 'Job UUID required.' })
  }
  const constFile = path.join(uploadFolder, uuid.toString(), 'const.inp')
  try {
    await fs.promises.access(constFile)
    res.download(constFile, (err) => {
      if (err) {
        res.status(500).json({
          message: 'Could not download the file . ' + err
        })
      }
    })
  } catch (error) {
    logger.error(`No ${constFile} available. ${error}`)
    res.status(500).json({ message: `No ${constFile} available.` })
  }
}

const getVizJson = async (req: Request, res: Response) => {
  const uuid = req.params.uuid
  if (!uuid) {
    return res.status(400).json({ message: 'UUID parameter required.' })
  }
  const filePath = path.join(uploadFolder, uuid, 'viz.json')
  try {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return res.status(404).json({ message: 'viz.json not found' })
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', 'application/json')
    res.sendFile(filePath)
  } catch (error) {
    logger.error(`Error serving viz.json for UUID ${uuid}: ${error}`)
    res.status(500).json({ message: 'Error serving viz.json' })
  }
}

const getPaeBin = async (req: Request, res: Response) => {
  const uuid = req.params.uuid
  if (!uuid) {
    return res.status(400).json({ message: 'UUID parameter required.' })
  }
  const filePath = path.join(uploadFolder, uuid, 'pae.bin')
  try {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return res.status(404).json({ message: 'pae.bin not found' })
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', 'application/octet-stream')
    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
    stream.on('error', (err) => {
      logger.error(`Error streaming pae.bin for UUID ${uuid}: ${err}`)
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming pae.bin' })
      }
    })
  } catch (error) {
    logger.error(`Error serving pae.bin for UUID ${uuid}: ${error}`)
    res.status(500).json({ message: 'Error serving pae.bin' })
  }
}

const getPaePng = async (req: Request, res: Response) => {
  const uuid = req.params.uuid
  if (!uuid) {
    return res.status(400).json({ message: 'UUID parameter required.' })
  }
  const filePath = path.join(uploadFolder, uuid, 'pae.png')
  try {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return res.status(404).json({ message: 'pae.png not found' })
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', 'image/png')
    res.sendFile(filePath)
  } catch (error) {
    logger.error(`Error serving pae.png for UUID ${uuid}: ${error}`)
    res.status(500).json({ message: 'Error serving pae.png' })
  }
}

const getVizPng = async (req: Request, res: Response) => {
  const uuid = req.params.uuid
  if (!uuid) {
    return res.status(400).json({ message: 'UUID parameter required.' })
  }
  const filePath = path.join(uploadFolder, uuid, 'viz.png')
  try {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return res.status(404).json({ message: 'viz.png not found' })
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', 'image/png')
    res.sendFile(filePath)
  } catch (error) {
    logger.error(`Error serving viz.png for UUID ${uuid}: ${error}`)
    res.status(500).json({ message: 'Error serving viz.png' })
  }
}

export {
  createNewConstFile,
  getAf2PaeStatus,
  downloadConstFile,
  getVizJson,
  getPaeBin,
  getPaePng,
  getVizPng
}
