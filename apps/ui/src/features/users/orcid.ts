// ORCID sign-ins get an opaque `orcid-<iD>` username (PR 3 of #817).
const ORCID_USERNAME_PREFIX = 'orcid-'

export const getOrcidId = (username: string): string | null =>
  username.startsWith(ORCID_USERNAME_PREFIX)
    ? username.slice(ORCID_USERNAME_PREFIX.length)
    : null
