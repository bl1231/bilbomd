import type { Request, Response } from 'express'
import { Job as JobModel } from '@bilbomd/mongodb-schema'
import type { IJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'
import path from 'path'

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

// Update the toPublicUrl function to use the new streaming endpoint
function toPublicUrl(
  absPath?: string | null,
  jobId?: string,
  label?: string
): string | undefined {
  if (!absPath || !jobId || !label) return undefined

  // Extract filename from absolute path
  const filename = path.basename(absPath)

  // Return the streaming endpoint URL including the label/subfolder
  return `/api/v1/jobs/${jobId}/movies/${label}/${filename}`
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

    const normalizedMovies: NormalizedMovieAsset[] = movies.map(
      (movie: MovieAsset) => ({
        label: movie.label,
        status: movie.status,
        mp4: toPublicUrl(movie.mp4, id, movie.label),
        poster: toPublicUrl(movie.poster, id, movie.label),
        thumb: toPublicUrl(movie.thumb, id, movie.label),
        source: movie.source
          ? {
              pdb: toPublicUrl(movie.source.pdb, id, movie.label),
              dcd: toPublicUrl(movie.source.dcd, id, movie.label),
              constYaml: toPublicUrl(movie.source.constYaml, id, movie.label)
            }
          : undefined,
        meta: movie.meta,
        error: movie.error,
        createdAt: movie.createdAt,
        updatedAt: movie.updatedAt
      })
    )

    logger.info(`Normalized ${normalizedMovies.length} movies for response`)
    logger.debug(`Normalized movies:`, normalizedMovies)

    const response = { movies: normalizedMovies }
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
