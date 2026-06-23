import { jobsApiSlice } from 'slices/jobsApiSlice'
import { usersApiSlice } from 'slices/usersApiSlice'
import { configApiSlice } from 'slices/configsApiSlice'
import { bullmqApiSlice } from 'features/bullmq/bullmqApiSlice'
import { useAppDispatch } from 'app/hooks'
import useAuth from 'hooks/useAuth'
import { useEffect } from 'react'
import { Outlet } from 'react-router'

const Prefetch = () => {
  const dispatch = useAppDispatch()
  const { isManager, isAdmin } = useAuth()

  useEffect(() => {
    // Dispatch into the real app store so the logged-in token is attached;
    // these warm the cache the RTK Query hooks read later.
    dispatch(
      configApiSlice.util.prefetch('getConfigs', 'configData', { force: true })
    )
    dispatch(
      jobsApiSlice.util.prefetch('getJobs', 'jobsList', { force: true })
    )
    // The queue summary (getQueueState) is shown to every authenticated user
    // on the Jobs page, so prefetch it for everyone.
    dispatch(
      bullmqApiSlice.util.prefetch('getQueueState', 'queueList', {
        force: true
      })
    )
    // The user list is only viewable by Managers/Admins; skip it for plain
    // Users so we don't fetch data they'll never render.
    if (isManager || isAdmin) {
      dispatch(
        usersApiSlice.util.prefetch('getUsers', 'usersList', { force: true })
      )
    }
  }, [dispatch, isManager, isAdmin])

  return <Outlet />
}
export default Prefetch
