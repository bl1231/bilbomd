import type { Request, Response } from 'express'
import { Job as JobModel } from '@bilbomd/mongodb-schema'
import type { IJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'
import path from 'path'
import { publicJobQuery } from './utils/publicJobQuery.js'

interface MovieAsset {
  label: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  mp4?: string
  poster?: string
  thumb?: string
  source?: { pdb?: string; dcd?: string; constYaml?: string }
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

interface Assets {
  movies: MovieAsset[]
}

interface JobWithAssets extends IJob {
  assets?: Assets
}

interface NormalizedMovieAsset extends Omit<MovieAsset, 'source'> {
  source?: { pdb?: string; dcd?: string; constYaml?: string }
}

interface MoviesResponse {
  movies: NormalizedMovieAsset[]
}

function toPublicUrl(
  absPath?: string | null,
  publicId?: string,
  label?: string
): string | undefined {
  if (!absPath || !publicId || !label) return undefined
  const filename = path.basename(absPath)
  return `/api/v1/public/jobs/${publicId}/movies/${label}/${filename}`
}

const getPublicMovies = async (
  req: Request,
  res: Response
): Promise<Response<MoviesResponse>> => {
  const rawPublicId = req.params.publicId
  const publicId = Array.isArray(rawPublicId) ? rawPublicId[0] : rawPublicId

  if (!publicId) {
    return res.status(400).json({ error: 'Missing publicId' })
  }

  try {
    const job = (await JobModel.findOne(publicJobQuery(publicId), {
      'assets.movies': 1
    }).lean()) as JobWithAssets | null

    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const movies: MovieAsset[] = job.assets?.movies ?? []

    const normalizedMovies: NormalizedMovieAsset[] = movies.map((movie) => ({
      label: movie.label,
      status: movie.status,
      mp4: toPublicUrl(movie.mp4, publicId, movie.label),
      poster: toPublicUrl(movie.poster, publicId, movie.label),
      thumb: toPublicUrl(movie.thumb, publicId, movie.label),
      source: movie.source
        ? {
            pdb: toPublicUrl(movie.source.pdb, publicId, movie.label),
            dcd: toPublicUrl(movie.source.dcd, publicId, movie.label),
            constYaml: toPublicUrl(
              movie.source.constYaml,
              publicId,
              movie.label
            )
          }
        : undefined,
      meta: movie.meta,
      error: movie.error,
      createdAt: movie.createdAt,
      updatedAt: movie.updatedAt
    }))

    logger.info(
      `getPublicMovies: publicId=${publicId}, ${normalizedMovies.length} movies`
    )
    return res.json({ movies: normalizedMovies })
  } catch (err) {
    logger.error(`Error fetching public movies: ${err}`)
    return res.status(500).json({ error: 'Failed to fetch movies' })
  }
}

export default getPublicMovies
