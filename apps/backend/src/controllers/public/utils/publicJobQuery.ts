// Jobs are reachable without authentication in two ways: anonymous jobs via
// their public_id, and registered-user jobs via the unguessable results_token
// sent in the job-complete email (issue #978). Both are uuid v4 capability
// tokens, so a single URL param can match either.
const publicJobQuery = (token: string) => ({
  $or: [
    { public_id: token, access_mode: 'anonymous' as const },
    { results_token: token }
  ]
})

export { publicJobQuery }
