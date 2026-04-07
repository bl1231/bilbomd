import { useGetNerscStatusQuery } from 'slices/nerscApiSlice'
import { Alert, LinearProgress, Box } from '@mui/material'
import { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { SerializedError } from '@reduxjs/toolkit'

interface NerscStatusCheckerProps {
  systemName: string
  onStatusCheck: (isUnavailable: boolean) => void
}

const NerscStatusChecker: React.FC<NerscStatusCheckerProps> = ({
  systemName,
  onStatusCheck
}) => {
  const {
    data: nerscStat,
    isSuccess: nerscStatIsSuccess,
    error: nerscStatError,
    isLoading: nerscStatIsLoading
  } = useGetNerscStatusQuery()

  const isFetchBaseQueryError = (
    error: unknown
  ): error is FetchBaseQueryError =>
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number' &&
    'data' in error

  const isSerializedError = (error: unknown): error is SerializedError =>
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'

  // If NERSC status is successfully fetched, find the relevant system
  const systemStatus = nerscStatIsSuccess
    ? nerscStat.find((system) => system.name === systemName)
    : null
  // console.log('systemStatus:', systemStatus)
  // Determine if the system is unavailable
  const isUnavailable = systemStatus?.status === 'unavailable'

  // Notify the parent component of the status
  onStatusCheck(isUnavailable)

  return (
    <>
      {nerscStatIsLoading && (
        <Box sx={{ my: 1, width: '520px' }}>
          <LinearProgress />
        </Box>
      )}

      {isUnavailable && (
        <Alert severity="warning">
          {systemName} is currently unavailable:{' '}
          <b>{systemStatus.description}</b>
        </Alert>
      )}

      {nerscStatError && (
        <Alert severity="error">
          {isFetchBaseQueryError(nerscStatError)
            ? `Error: ${nerscStatError.status} - ${nerscStatError.data}`
            : isSerializedError(nerscStatError)
              ? `Error: ${nerscStatError.message}`
              : 'An unknown error occurred'}
        </Alert>
      )}
    </>
  )
}

export default NerscStatusChecker
