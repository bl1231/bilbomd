import { Document, Types } from 'mongoose'
import { IJob } from './jobInterface'

interface IOtp {
  code: string
  expiresAt: Date
}

interface IConfirmationCode {
  code: string
  expiresAt: Date
}

interface IAPIToken {
  _id?: Types.ObjectId
  tokenHash: string
  label?: string
  createdAt: Date
  expiresAt?: Date
}

interface OAuthIdentity {
  provider: 'google' | 'orcid' | 'github' | string
  id: string
  name: string
  accessToken?: string
  refreshToken?: string
  tokenType?: string
  scope?: string
  expiresIn?: number
  tokenIssuedAt?: Date
}

interface IUser extends Document {
  _id: Types.ObjectId
  username: string
  roles: string[]
  oauth: OAuthIdentity[]
  refreshToken: string[]
  apiTokens: IAPIToken[]
  email: string
  firstName: string | null
  lastName: string | null
  newEmail: string | null
  previousEmails: string[]
  status: string
  active: boolean
  confirmationCode: IConfirmationCode | null
  otp: IOtp | null
  UUID: string
  createdAt: Date
  updatedAt: Date
  last_access: Date
  jobs: IJob[] | null
  jobCount: number
  jobTypes: Map<string, number>
}

export { IUser, IAPIToken }
