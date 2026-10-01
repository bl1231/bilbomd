export interface SubmitError {
  message: string
  details: string[]
}

interface ApiErrorBody {
  message?: unknown
  errors?: unknown
}

const DEFAULT_MESSAGE = 'An error occurred during submission.'

// Pull a user-facing message out of an RTK Query mutation error. Job
// submission endpoints answer a failed validation with
// `{ message: 'Validation failed', errors: [{ path, message }] }`, and the
// per-field messages are the part that tells the user what to fix.
export const getSubmitError = (
  error: unknown,
  fallback: string = DEFAULT_MESSAGE
): SubmitError => {
  const data =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: unknown }).data
      : undefined
  const body =
    typeof data === 'object' && data !== null ? (data as ApiErrorBody) : {}

  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message
      : fallback

  const details = Array.isArray(body.errors)
    ? body.errors
        .map((e) =>
          typeof e === 'object' && e !== null && 'message' in e
            ? (e as { message?: unknown }).message
            : undefined
        )
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    : []

  return { message, details: [...new Set(details)] }
}
