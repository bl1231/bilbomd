// User-facing label derived from profile fields. Lives separate from the
// internal `username` (which is an opaque identifier used in URL paths,
// the JWT `username` claim, and job-ownership filters). See PR 3 of
// https://github.com/bl1231/bilbomd/issues/817.
export interface DisplayNameSource {
  username: string
  firstName?: string | null
  lastName?: string | null
}

export const userDisplayName = (user: DisplayNameSource): string => {
  const first = user.firstName?.trim()
  const last = user.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  return user.username
}
