// Mirrors apps/backend/src/controllers/auth/displayName.ts so the UI can
// derive a user's human-readable label from a UserDTO returned by the
// `/users` endpoint, where the JWT-derived `displayName` from useAuth()
// is not available. See PR 3 of issue #817.
export interface DisplayNameSource {
  username?: string
  firstName?: string | null
  lastName?: string | null
}

export const userDisplayName = (user: DisplayNameSource): string => {
  const first = user.firstName?.trim()
  const last = user.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  return user.username ?? ''
}
