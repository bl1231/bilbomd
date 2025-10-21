import type { Request, Response } from 'express'
import { Job as JobModel } from '@bilbomd/mongodb-schema'
import type { IJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

// Movie asset interface (matching the schema)
interface MovieAsset {
  label: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  mp4?: string
  poster?: string
  thumb?: string
  source?: {
    pdb?: string
    dcd?: string
    constYaml?: string
  }
  meta?: {
    width?: number
    height?: number
    stride?: number
    fps?: number
    ray?: boolean
  }
  error?: string
  createdAt?: Date
  updatedAt?: Date
}

// Assets container interface
interface Assets {
  movies: MovieAsset[]
}

// Response type for the API
interface MoviesResponse {
  movies: NormalizedMovieAsset[]
}

// Normalized movie asset for the API response
interface NormalizedMovieAsset {
  label: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  mp4?: string
  poster?: string
  thumb?: string
  source?: {
    pdb?: string
    dcd?: string
    constYaml?: string
  }
  meta?: {
    width?: number
    height?: number
    stride?: number
    fps?: number
    ray?: boolean
  }
  error?: string
  createdAt?: Date
  updatedAt?: Date
}

// Type for the job document with assets
interface JobWithAssets extends IJob {
  assets?: Assets
}

// Maps absolute paths on disk to public URLs the frontend can load.
// Adjust if your mount differs (e.g., /data/uploads → /uploads).
function toPublicUrl(absPath?: string | null): string | undefined {
  if (!absPath) return undefined
  // Normalize and guard: only rewrite known upload root
  const UPLOAD_FS_ROOT = '/bilbomd/uploads'
  const UPLOAD_URL_ROOT = '/uploads'
  if (absPath.startsWith(UPLOAD_FS_ROOT)) {
    return absPath.replace(UPLOAD_FS_ROOT, UPLOAD_URL_ROOT)
  }
  // If it's already a URL or lives elsewhere, return as-is
  return absPath
}

const getMovies = async (
  req: Request,
  res: Response
): Promise<Response<MoviesResponse>> => {
  logger.info('getMovies controller called')

  try {
    const { id } = req.params
    logger.info(`Extracting job ID from params: ${id}`)

    if (!id) {
      logger.warn('Missing job id in request params')
      return res.status(400).json({ error: 'Missing job id' })
    }

    logger.info(`Attempting to find job with ID: ${id}`)

    // Only fetch the movies array to keep payload small
    const job = (await JobModel.findById(id, {
      'assets.movies': 1
    }).lean()) as JobWithAssets | null

    logger.info(`Job query result: ${job ? 'found' : 'not found'}`)

    if (!job) {
      logger.warn(`Job not found for ID: ${id}`)
      return res.status(404).json({ error: 'Job not found' })
    }

    const movies: MovieAsset[] = job.assets?.movies ?? []
    logger.info(`Found ${movies.length} movies in job assets`)
    logger.debug(`Job assets structure:`, job.assets)
    logger.debug(`Movies array:`, movies)

    const normalized: NormalizedMovieAsset[] = movies.map(
      (movie: MovieAsset) => ({
        label: movie.label,
        status: movie.status,
        mp4: toPublicUrl(movie.mp4),
        poster: toPublicUrl(movie.poster),
        thumb: toPublicUrl(movie.thumb),
        source: {
          // Expose source as URLs only if you want the UI to navigate to them.
          // Otherwise, omit these fields or keep for debugging.
          pdb: toPublicUrl(movie.source?.pdb),
          dcd: toPublicUrl(movie.source?.dcd),
          constYaml: toPublicUrl(movie.source?.constYaml)
        },
        meta: movie.meta ?? {},
        error: movie.error,
        createdAt: movie.createdAt,
        updatedAt: movie.updatedAt
      })
    )

    logger.info(`Normalized ${normalized.length} movies for response`)
    logger.debug(`Normalized movies:`, normalized)

    const response = { movies: normalized }
    logger.info('Sending successful response with movies data')
    return res.json(response)
  } catch (err: unknown) {
    // Avoid leaking internal errors; provide a minimal message
    logger.error('Error fetching movies:', err)
    console.error('Error fetching movies:', err)
    return res.status(500).json({ error: 'Failed to fetch movies' })
  }
}

export default getMovies
