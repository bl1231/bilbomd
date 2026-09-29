import { Outlet } from 'react-router'
import { useEffect } from 'react'
import { CircularProgress } from '@mui/material'
import { useRefreshMutation } from 'slices/authApiSlice'
import { useAppSelector } from 'app/hooks'
import { selectCurrentToken } from 'slices/authSlice'
import usePersist from 'hooks/usePersist'
import { logger } from 'utils/logger'

// Like PersistLogin, but for pages anyone may view (e.g. the public results
// page linked from job emails). It quietly restores a logged-in session from
// the refresh cookie, and on failure just renders the page anonymously
// instead of showing a "Session has expired" screen.
const SoftPersistLogin = () => {
  const [persist] = usePersist()
  const token = useAppSelector(selectCurrentToken)

  const [refresh, { isUninitialized, isLoading }] = useRefreshMutation()

  const shouldRefresh = persist && !token

  useEffect(() => {
    if (shouldRefresh) {
      refresh(undefined)
        .unwrap()
        .catch((err: unknown) => {
          logger.debug('Soft refresh failed; continuing anonymously:', err)
        })
    }
  }, [shouldRefresh, refresh])

  // Hold the page until the refresh settles so the anonymous layout doesn't
  // flash before the logged-in one.
  if (shouldRefresh && (isUninitialized || isLoading)) {
    return <CircularProgress />
  }

  return <Outlet />
}

export default SoftPersistLogin
