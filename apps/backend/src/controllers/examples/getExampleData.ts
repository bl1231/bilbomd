import type { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import { logger } from '../../middleware/loggers.js'

const EXAMPLE_DATA_ROOT =
  process.env.EXAMPLE_DATA && process.env.EXAMPLE_DATA.trim() !== ''
    ? process.env.EXAMPLE_DATA
    : '/app/examples'

type ExampleKey =
  | 'bilbomd-classic-pdb'
  | 'bilbomd-classic-crd'
  | 'bilbomd-auto'
  | 'bilbomd-af'
  | 'bilbomd-sans'
  | 'scoper'

type ExampleConfig = {
  /** Absolute path to the archive or example bundle on disk */
  filePath: string
  /** Suggested filename for the client download */
  downloadName: string
}

/**
 * Map logical example keys to concrete files on disk.
 * Adjust the paths/filenames here to match your actual layout under EXAMPLE_DATA.
 */
const exampleConfigMap: Record<ExampleKey, ExampleConfig> = {
  'bilbomd-classic-pdb': {
    filePath: path.join(
      EXAMPLE_DATA_ROOT,
      'bilbomd_classic_pdb_example.tar.gz'
    ),
    downloadName: 'bilbomd_classic_pdb_example.tar.gz'
  },
  'bilbomd-classic-crd': {
    filePath: path.join(
      EXAMPLE_DATA_ROOT,
      'bilbomd_classic_crd_example.tar.gz'
    ),
    downloadName: 'bilbomd_classic_crd_example.tar.gz'
  },
  'bilbomd-auto': {
    filePath: path.join(EXAMPLE_DATA_ROOT, 'bilbomd_auto_example.tar.gz'),
    downloadName: 'bilbomd_auto_example.tar.gz'
  },
  'bilbomd-af': {
    filePath: path.join(EXAMPLE_DATA_ROOT, 'bilbomd_af_example.tar.gz'),
    downloadName: 'bilbomd_af_example.tar.gz'
  },
  'bilbomd-sans': {
    filePath: path.join(EXAMPLE_DATA_ROOT, 'bilbomd_sans_example.tar.gz'),
    downloadName: 'bilbomd_sans_example.tar.gz'
  },
  scoper: {
    filePath: path.join(EXAMPLE_DATA_ROOT, 'scoper_example.tar.gz'),
    downloadName: 'scoper_example.tar.gz'
  }
}

/**
 * Generic helper that sends an example bundle if it exists.
 */
function sendExampleBundle(
  key: ExampleKey,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const cfg = exampleConfigMap[key]

  if (!cfg) {
    logger.warn(`Example config not found for key=${key}`)
    return res.status(404).json({ message: 'Example dataset not found' })
  }

  if (!fs.existsSync(cfg.filePath)) {
    logger.warn(
      `Example dataset missing on disk for key=${key}, path=${cfg.filePath}`
    )
    return res
      .status(404)
      .json({ message: 'Example dataset is not available on the server' })
  }

  logger.info(
    `Serving example dataset key=${key} from ${cfg.filePath} to ${req.ip}`
  )

  // res.download will set appropriate headers and stream the file
  return res.download(cfg.filePath, cfg.downloadName, (err) => {
    if (err) {
      logger.error(
        `Error sending example dataset key=${key}, path=${cfg.filePath}: ${err}`
      )
      if (!res.headersSent) {
        return next(err)
      }
    }
  })
}

// Route-specific handlers

export const getClassicPdbExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('bilbomd-classic-pdb', req, res, next)

export const getClassicCrdExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('bilbomd-classic-crd', req, res, next)

export const getClassicAutoExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('bilbomd-auto', req, res, next)

export const getClassicAfExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('bilbomd-af', req, res, next)

export const getClassicSansExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('bilbomd-sans', req, res, next)

export const getClassicScoperExample = (
  req: Request,
  res: Response,
  next: NextFunction
) => sendExampleBundle('scoper', req, res, next)
