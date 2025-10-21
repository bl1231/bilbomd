import type { Request, Response } from 'express'
import { Job as JobModel } from '@bilbomd/mongodb-schema'
import type { IJob } from '@bilbomd/mongodb-schema'

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
  try {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({ error: 'Missing job id' })
    }

    // Only fetch the movies array to keep payload small
    const job = (await JobModel.findById(id, {
      'assets.movies': 1
    }).lean()) as JobWithAssets | null
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const movies: MovieAsset[] = job.assets?.movies ?? []

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

    return res.json({ movies: normalized })
  } catch (err: unknown) {
    // Avoid leaking internal errors; provide a minimal message
    console.error('Error fetching movies:', err)
    return res.status(500).json({ error: 'Failed to fetch movies' })
  }
}

export default getMovies
