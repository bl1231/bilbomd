import type { UserDTO } from '@bilbomd/bilbomd-types'

// One word an admin can scan, sort, and search on. `Pending` means the
// account has never confirmed its email, which is different from an admin
// having switched it off.
export type UserStatusLabel = 'Active' | 'Inactive' | 'Pending'

export const userStatusLabel = (
  user: Pick<UserDTO, 'active' | 'status'>
): UserStatusLabel => {
  if (!user.active) return 'Inactive'
  if (user.status === 'Pending') return 'Pending'
  return 'Active'
}

export const userStatusColor = (
  label: UserStatusLabel
): 'success' | 'default' | 'warning' => {
  if (label === 'Active') return 'success'
  if (label === 'Pending') return 'warning'
  return 'default'
}

export interface UsersListFilter {
  showInactive: boolean
}

export const filterUsers = (
  users: UserDTO[],
  { showInactive }: UsersListFilter
): UserDTO[] => (showInactive ? users : users.filter((u) => u.active))

// Words the quick filter should match on. Roles are joined so "admin" finds
// every admin, and the display name is included because the grid's own
// search only sees column values.
export const quickFilterWords = (input: string): string[] =>
  input
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
