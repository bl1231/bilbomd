import { Request, Response, NextFunction, RequestHandler } from 'express'

type UsernameSource = 'params' | 'body'

// Guards self-service account endpoints so a caller can only act on their own
// account. The target username is read from the route params or request body
// and compared against req.user (set by verifyJWT). Mirrors the inline
// ownership check used by the API token controllers.
const verifyAccountOwnership = (source: UsernameSource): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const target = source === 'params' ? req.params.username : req.body?.username
    const targetUsername = Array.isArray(target) ? target[0] : target

    if (!targetUsername || req.user !== targetUsername) {
      res.status(403).json({ success: false, message: 'Forbidden' })
      return
    }

    next()
  }
}

export { verifyAccountOwnership }
