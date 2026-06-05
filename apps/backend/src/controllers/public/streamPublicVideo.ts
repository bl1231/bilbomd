import { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { Job as JobModel, IAssets, IMovieAsset } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

const streamPublicVideo = async (req: Request, res: Response) => {
  try {
    const { publicId, label, filename } = req.params

    const job = await JobModel.findOne({
      public_id: publicId,
      access_mode: 'anonymous'
    })
    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    const assets = job.assets as IAssets | undefined
    const movies = assets?.movies ?? []
    const movieAsset = movies.find(
      (movie: IMovieAsset) =>
        movie.label === label &&
        ((movie.mp4 && path.basename(movie.mp4) === filename) ||
          (movie.poster && path.basename(movie.poster) === filename) ||
          (movie.thumb && path.basename(movie.thumb) === filename))
    )
    if (!movieAsset) {
      return res.status(404).json({ message: 'Movie asset not found' })
    }

    let mediaPath = ''
    if (movieAsset.mp4 && path.basename(movieAsset.mp4) === filename) {
      mediaPath = movieAsset.mp4
    } else if (
      movieAsset.poster &&
      path.basename(movieAsset.poster) === filename
    ) {
      mediaPath = movieAsset.poster
    } else if (
      movieAsset.thumb &&
      path.basename(movieAsset.thumb) === filename
    ) {
      mediaPath = movieAsset.thumb
    } else {
      return res.status(404).json({ message: 'File not found in movie asset' })
    }

    const resolvedPath = path.resolve(mediaPath)
    const uploadsPath = path.resolve('/bilbomd/uploads')
    if (!resolvedPath.startsWith(uploadsPath)) {
      logger.warn(`Path traversal attempt on public stream: ${mediaPath}`)
      return res.status(403).json({ message: 'Invalid file path' })
    }

    let stat: fs.Stats
    try {
      stat = await fs.promises.stat(resolvedPath)
    } catch {
      return res.status(404).json({ message: 'Media file not found' })
    }

    const fileSize = stat.size
    const range = req.headers.range
    const contentType = getContentType(filename)

    if (contentType.startsWith('video/') && range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      })
      fs.createReadStream(resolvedPath, { start, end }).pipe(res)
    } else {
      const headers: Record<string, string | number> = {
        'Content-Length': fileSize,
        'Content-Type': contentType
      }
      if (contentType.startsWith('video/')) {
        headers['Accept-Ranges'] = 'bytes'
        headers['Cache-Control'] = 'public, max-age=3600'
      } else {
        headers['Cache-Control'] = 'public, max-age=86400'
      }
      res.writeHead(200, headers)
      fs.createReadStream(resolvedPath).pipe(res)
    }

    logger.info(`Public media served: ${filename} for publicId=${publicId}`)
  } catch (error) {
    logger.error('Error streaming public media:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export default streamPublicVideo
