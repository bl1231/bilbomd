import useAuth from 'hooks/useAuth'
import MainLayout from 'layout/MainLayout'
import AnonLayout from 'layout/AnonLayout'

// Public pages (the anonymous landing page, help, about, the anonymous job
// forms, and the results pages linked from job emails) are reachable by
// anonymous and registered users alike. Once SoftPersistLogin has restored a
// session, logged-in users get the full dashboard chrome instead of the
// anonymous header with its Register/Login buttons.
const PublicLayout = () => {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <MainLayout /> : <AnonLayout />
}

export default PublicLayout
