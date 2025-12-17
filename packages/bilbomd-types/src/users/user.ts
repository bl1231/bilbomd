export interface UserSummaryDTO {
  id: string
  email: string
  username: string
}

export type UserRole = 'Admin' | 'Manager' | 'User'

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
