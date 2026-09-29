import { useCallback, useState } from 'react'
import { axiosInstance } from 'app/api/axios'
import { useAppSelector } from 'app/hooks'
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
  const token = useAppSelector(selectCurrentToken)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const url = resultsUrl(source)
  const isOwner = source.kind === 'owner'

  const download = useCallback(async () => {
    setError(null)
    setIsDownloading(true)
    try {
      const response = await axiosInstance.get<Blob>(url, {
        responseType: 'blob',
        headers:
          isOwner && token ? { Authorization: `Bearer ${token}` } : undefined
      })
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
  }, [url, isOwner, token])

  return {
    download,
    error,
    clearError: () => setError(null),
    isDownloading
  }
}
