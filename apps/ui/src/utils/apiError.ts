// RTK Query errors are either { status, data: { message } } from the API or
// { status, error } for network failures. Pull out something readable.
export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object') {
    const data = (err as { data?: unknown }).data
    if (data && typeof data === 'object') {
      const message = (data as { message?: unknown }).message
      if (typeof message === 'string' && message) return message
    }
    const error = (err as { error?: unknown }).error
    if (typeof error === 'string' && error) return error
  }
  return fallback
}
