import type { IUser } from '@bl1231/bilbomd-mongodb-schema'

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
    }
  }
}
