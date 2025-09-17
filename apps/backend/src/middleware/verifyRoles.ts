import { Request, Response, NextFunction, RequestHandler } from 'express'

const verifyRoles = (...allowedRoles: string[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.roles) {
      res.sendStatus(401) // Unauthorized
      return
    }
    const rolesArray = [...allowedRoles]
    // Need to read up on these Higher Order Functions.
    const result = req.roles
      .map((role) => rolesArray.includes(role))
      .find((val) => val === true)
    if (!result) {
      res.sendStatus(401) // Unauthorized
      return
    }
    // console.log(rolesArray)
    next()
  }
}

export { verifyRoles }
