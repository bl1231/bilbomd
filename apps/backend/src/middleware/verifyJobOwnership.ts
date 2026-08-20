import { Request, Response, NextFunction } from 'express'
import { Types } from 'mongoose'
import { Job, MultiJob, User } from '@bilbomd/mongodb-schema'
import { logger } from './loggers.js'

const PRIVILEGED_ROLES = ['Admin', 'Manager']
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// Guards every `/:id` job route so a caller can only act on a job they own.
// Admins and Managers may act on any job. Works for both auth paths:
//   - verifyJWT / verifyVideoSession set `req.user` (username) + `req.roles`
//   - verifyAPIToken sets `req.apiUser` (full IUser document)
// When `req.user` is present it takes precedence over `req.apiUser`.
// Jobs store the owner as an embedded `{ user: { _id } }` object while
// MultiJobs store a plain ObjectId ref, so the ownership filter checks both
// shapes — the same filter `getAllJobs` uses.
//
// Non-owned and non-existent ids both yield 404 so the endpoint cannot be used
// to confirm that a given job id exists.
const verifyJobOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const rawId = req.params.id
  const jobId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!jobId || !OBJECT_ID_RE.test(jobId)) {
    res.status(400).json({ message: 'Invalid Job ID format.' })
    return
  }

  try {
    let roles: string[]
    let userId: Types.ObjectId | undefined
    let requester: string

    // Prefer the JWT/session identity; fall back to the API-token identity.
    if (req.user) {
      roles = req.roles ?? []
      requester = req.user
    } else if (req.apiUser) {
      roles = req.apiUser.roles ?? []
      userId = req.apiUser._id as Types.ObjectId
      requester = req.apiUser.username ?? String(userId)
    } else {
      res.status(401).json({ message: 'Unauthorized' })
      return
    }

    if (roles.some((role) => PRIVILEGED_ROLES.includes(role))) {
      next()
      return
    }

    if (!userId) {
      const user = await User.findOne({ username: req.user })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>()
      if (!user) {
        logger.warn(
          `verifyJobOwnership: no user record for username ${req.user}`
        )
        res.status(401).json({ message: 'Unauthorized' })
        return
      }
      userId = user._id
    }

    const ownerFilter = {
      _id: jobId,
      $or: [{ user: userId }, { 'user._id': userId }]
    }

    const owned =
      (await Job.exists(ownerFilter)) ?? (await MultiJob.exists(ownerFilter))

    if (!owned) {
      logger.warn(
        `Access denied: ${requester} attempted to access job ${jobId} they do not own`
      )
      res.status(404).json({ message: `No job matches ID ${jobId}.` })
      return
    }

    next()
  } catch (error) {
    logger.error(`verifyJobOwnership error for job ${jobId}: ${error}`)
    res.status(500).json({ message: 'Failed to verify job ownership.' })
  }
}

export { verifyJobOwnership }
