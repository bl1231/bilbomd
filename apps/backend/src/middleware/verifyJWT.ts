import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'

interface DecodedJWT {
  UserInfo: {
    username: string
    roles: string[]
    email: string
  }
  iat: number
  exp: number
}

const verifyJWT = (req: Request, res: Response, next: NextFunction) => {
  // Check both 'authorization' and 'Authorization' headers and cast to string
  const authHeader = (req.headers.authorization || req.headers.Authorization) as string

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const token = authHeader.split(' ')[1]

  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET || '',
    { algorithms: ['HS256'] },
    (error, decoded) => {
      if (error) {
        res.status(403).json({ message: 'Forbidden - ', error })
        return
      }

      const userInfo = (decoded as DecodedJWT).UserInfo

      if (userInfo) {
        req.user = userInfo.username
        req.roles = userInfo.roles
        req.email = userInfo.email
        next()
      } else {
        res.status(403).json({ message: 'Forbidden - no userInfo' })
        return
      }
    }
  )
}

export { verifyJWT }
