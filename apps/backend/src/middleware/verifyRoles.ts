import { Request, Response, NextFunction, RequestHandler } from 'express'

const verifyRoles = (...allowedRoles: string[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.roles) {
      res.sendStatus(401) // Unauthorized
      return
    }
    const rolesArray = [...allowedRoles]
    const result = req.roles.some((role) => rolesArray.includes(role))
    if (!result) {
      res.sendStatus(401) // Unauthorized
      return
    }
    next()
  }
}

export { verifyRoles }
