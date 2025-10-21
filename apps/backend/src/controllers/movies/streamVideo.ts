import { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { Job as JobModel } from '@bilbomd/mongodb-schema'
import { logger } from '../../middleware/loggers.js'

interface AuthenticatedRequest extends Request {
  userId?: string
}

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

const streamVideo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, filename } = req.params
    const userId = req.userId // From JWT middleware

    logger.info(
      `Media stream request: job=${id}, file=${filename}, user=${userId}`
    )

    // Verify user has access to this job
    const job = await JobModel.findById(id)
    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    // Check if user owns the job (you might have different auth logic)
    if (job.user.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' })
    }

    // Construct the full file path
    const uploadsDir = '/bilbomd/uploads'
    const mediaPath = path.join(uploadsDir, id, 'movies', filename)

    // Security: Ensure the path is within uploads directory
    const resolvedPath = path.resolve(mediaPath)
    const uploadsPath = path.resolve(uploadsDir)
    if (!resolvedPath.startsWith(uploadsPath)) {
      logger.warn(`Path traversal attempt: ${mediaPath}`)
      return res.status(403).json({ message: 'Invalid file path' })
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      logger.warn(`Media file not found: ${resolvedPath}`)
      return res.status(404).json({ message: 'Media file not found' })
    }

    const stat = fs.statSync(resolvedPath)
    const fileSize = stat.size
    const range = req.headers.range
    const contentType = getContentType(filename)

    // For videos, handle range requests for seeking
    if (contentType.startsWith('video/') && range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      const stream = fs.createReadStream(resolvedPath, { start, end })

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600'
      })

      stream.pipe(res)
    } else {
      // Serve entire file (images and videos without range requests)
      const headers: Record<string, string | number> = {
        'Content-Length': fileSize,
        'Content-Type': contentType
      }

      // Only add Accept-Ranges for videos
      if (contentType.startsWith('video/')) {
        headers['Accept-Ranges'] = 'bytes'
      }

      // Different cache policies for different media types
      if (contentType.startsWith('image/')) {
        headers['Cache-Control'] = 'private, max-age=86400' // 24 hours for images
      } else {
        headers['Cache-Control'] = 'private, max-age=3600' // 1 hour for videos
      }

      res.writeHead(200, headers)
      fs.createReadStream(resolvedPath).pipe(res)
    }

    logger.info(`Media served: ${filename} (${contentType}) to user ${userId}`)
  } catch (error) {
    logger.error('Error streaming media:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export default streamVideo
