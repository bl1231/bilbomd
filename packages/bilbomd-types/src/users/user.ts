export interface UserSummaryDTO {
  id: string
  email: string
  username: string
}

export type UserRole = 'Admin' | 'Manager' | 'User'

export type UserStatus = 'Pending' | 'Active'

export interface UserDTO {
  id: string
  username: string
  email: string
  roles: UserRole[]
  firstName?: string | null
  lastName?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  UUID?: string
  /** Email-confirmation state; `Pending` until the account is verified. */
  status?: UserStatus
  /** ISO timestamp of the last login or token refresh, if ever recorded. */
  lastAccess?: string | null
  /** Number of jobs currently stored for this user. */
  jobCount?: number
  /** Linked OAuth providers, e.g. `['orcid']`. */
  oauthProviders?: string[]
  emailNotifications?: boolean
}

export interface CreateUserDTO {
  username: string
  email: string
  roles: UserRole[]
  firstName?: string
  lastName?: string
  institution?: string
}

export interface UpdateUserDTO {
  id: string
  roles?: UserRole[]
  firstName?: string
  lastName?: string
  email?: string
  active?: boolean
}
