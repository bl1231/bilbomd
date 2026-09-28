export type LoginFailure = {
  kind: 'rate_limited' | 'rejected' | 'unreachable' | 'server'
  message: string
}

// The login mutation goes through RTK Query, whose errors are
// { status, data } (status is a number, or e.g. 'FETCH_ERROR' when the
// server can't be reached). The backend puts its reason in data.message,
// or data.error for an expired link.
export const describeLoginFailure = (err: unknown): LoginFailure => {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status: unknown }).status
      : undefined
  const data =
    typeof err === 'object' && err !== null && 'data' in err
      ? ((err as { data: unknown }).data as
          { message?: string; error?: string } | undefined)
      : undefined
  const serverMessage = data?.message ?? data?.error

  if (typeof status !== 'number') {
    return {
      kind: 'unreachable',
      message:
        'Could not reach the BilboMD server. Check your connection and try again.'
    }
  }
  if (status === 429) {
    return {
      kind: 'rate_limited',
      message:
        serverMessage ??
        'Too many attempts. Please wait a minute and try again.'
    }
  }
  if (status >= 500) {
    return {
      kind: 'server',
      message: serverMessage ?? 'The server could not check your MagickLink.'
    }
  }
  return {
    kind: 'rejected',
    message: serverMessage ?? 'This MagickLink could not be used.'
  }
}
