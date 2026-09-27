import {
  createApi,
  fetchBaseQuery,
  FetchArgs,
  FetchBaseQueryError,
  BaseQueryFn
} from '@reduxjs/toolkit/query/react'
import { setCredentials } from '../../slices/authSlice'
import type { AppDispatch, RootState } from '../store'
import { logger } from 'utils/logger'

export const baseURL =
  process.env.NODE_ENV === 'test' ? 'http://localhost:3003/api/v1' : '/api/v1'

const baseQuery = fetchBaseQuery({
  baseUrl: baseURL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
    }
    return headers
  }
})

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  // This guard ensures `args` is of type FetchArgs
  const fetchArgs: FetchArgs =
    typeof args === 'string'
      ? { url: args }
      : args.url
        ? args
        : (() => {
            throw new Error('Missing URL in FetchArgs')
          })()

  let result = await baseQuery(fetchArgs, api, extraOptions)

  if (result?.error?.status === 403) {
    // Attempt to refresh the token
    const refreshResult = await baseQuery('/auth/refresh', api, extraOptions)

    if (refreshResult?.data) {
      const { accessToken } = refreshResult.data as { accessToken: string }
      api.dispatch(setCredentials({ accessToken }))

      // Retry original query
      result = await baseQuery(fetchArgs, api, extraOptions)

      // Return the result of the original query
      return result
    } else if (refreshResult?.error?.status === 403) {
      logger.error(
        'Refresh token expired or invalid:',
        refreshResult.error.data
      )
    }
    return refreshResult
  }

  return result
}

// Swaps the refresh cookie for a new access token, like baseQueryWithReauth
// does on a 403. For requests made outside RTK Query (the job event stream).
// Returns whether a new token was stored.
export const refreshAccessToken = async (
  dispatch: AppDispatch
): Promise<boolean> => {
  try {
    const res = await fetch(`${baseURL}/auth/refresh`, {
      credentials: 'include'
    })
    if (!res.ok) return false
    const { accessToken } = (await res.json()) as { accessToken?: string }
    if (!accessToken) return false
    dispatch(setCredentials({ accessToken }))
    return true
  } catch (error) {
    logger.error('Token refresh failed:', error)
    return false
  }
}

export const apiSlice = createApi({
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Job',
    'User',
    'Config',
    'FoxsAnalysis',
    'Stats',
    'Token',
    'AdminQueue',
    'Af2PaeViz',
    'MovieAsset',
    'PublicJob',
    'PublicMovieAsset',
    'Analytics'
  ],
  endpoints: () => ({})
})
