import useAuth from 'hooks/useAuth'
import MainLayout from 'layout/MainLayout'
import AnonLayout from 'layout/AnonLayout'

// Public results pages are opened from job emails by anonymous and
// registered users alike; logged-in users get the full dashboard chrome.
const PublicResultsLayout = () => {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <MainLayout /> : <AnonLayout />
}

export default PublicResultsLayout
