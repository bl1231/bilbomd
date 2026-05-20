const SENSITIVE_KEYS = new Set([
  'access_token',
  'refresh_token',
  'id_token',
  'accessToken',
  'refreshToken',
  'idToken'
])

export const redactTokens = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => redactTokens(item)) as unknown as T
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redactTokens(v)]
    )
    return Object.fromEntries(entries) as T
  }

  return value
}
