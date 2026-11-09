import { useCallback, useState } from 'react'
import { useStore } from 'react-redux'
import { axiosInstance, isAxiosError } from 'app/api/axios'
import { refreshAccessToken } from 'app/api/apiSlice'
import type { AppDispatch, RootState } from 'app/store'
import { selectCurrentToken } from 'slices/authSlice'
import { logger } from 'utils/logger'
import type { JobSource } from './jobSource'

const DEFAULT_FILENAME = 'results.tar.gz'

export const resultsUrl = (source: JobSource): string =>
  source.kind === 'owner'
    ? `jobs/${source.id}/results`
    : `/public/jobs/${source.token}/results`

export const filenameFromContentDisposition = (
  header: string | undefined
): string => {
  const match = header ? /filename="?([^"]+)"?/.exec(header) : null
  return match?.[1] ?? DEFAULT_FILENAME
}

const saveBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.parentNode?.removeChild(link)
  window.URL.revokeObjectURL(url)
}

// Downloads the results tarball for either kind of job source
export const useJobDownload = (source: JobSource) => {
  const store = useStore<RootState>()
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const url = resultsUrl(source)
  const isOwner = source.kind === 'owner'

  const download = useCallback(async () => {
    setError(null)
    setIsDownloading(true)
    // The token is read at request time: access tokens are short-lived
    const request = () => {
      const token = selectCurrentToken(store.getState())
      return axiosInstance.get<Blob>(url, {
        responseType: 'blob',
        headers:
          isOwner && token ? { Authorization: `Bearer ${token}` } : undefined
      })
    }
    try {
      let response
      try {
        response = await request()
      } catch (err) {
        // An expired access token gives a 403. This request is made outside
        // RTK Query, so nothing has refreshed the token on a page that has
        // stopped polling: refresh it here and try once more.
        const expired =
          isOwner && isAxiosError(err) && err.response?.status === 403
        if (
          !expired ||
          !(await refreshAccessToken(store.dispatch as AppDispatch))
        ) {
          throw err
        }
        response = await request()
      }
      if (!response?.data) {
        setError(
          'No data received from server. Please try again or contact support.'
        )
        return
      }
      saveBlob(
        response.data,
        filenameFromContentDisposition(
          response.headers['content-disposition'] as string | undefined
        )
      )
    } catch (err) {
      logger.error('Download results error:', err)
      setError(
        'Download failed. The results archive may be unavailable. Please try again or contact support.'
      )
    } finally {
      setIsDownloading(false)
    }
  }, [url, isOwner, store])

  return {
    download,
    error,
    clearError: () => setError(null),
    isDownloading
  }
}
