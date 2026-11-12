import type { IUser } from '@bilbomd/mongodb-schema'

export {}

declare global {
  namespace Express {
    export interface Request {
      user?: string
      roles?: string[]
      email?: string
      sfApiToken?: string
      id?: string
      apiUser?: IUser
      // SHA-256 of the API token, set by verifyAPIToken (rate-limit key)
      apiTokenHash?: string
    }
  }
}
