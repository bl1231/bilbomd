import { lazy } from 'react'
import Loadable from 'components/Loadable'
import SoftPersistLogin from 'features/auth/SoftPersistLogin'
import PublicLayout from 'layout/PublicLayout'

const PublicResultsPage = Loadable(
  lazy(() => import('features/public/PublicResultsPage'))
)

// ===========================|| PUBLIC RESULTS ROUTING ||============================ //

// Kept out of AnonRoutes so a logged-in user following the emailed results
// link gets their session (and the dashboard layout) back.
const PublicResultsRoutes = {
  element: <SoftPersistLogin />,
  path: '/',
  children: [
    {
      // Pathless so relative navigation in the layouts resolves from '/'
      element: <PublicLayout />,
      children: [
        {
          path: 'results/:publicId',
          element: <PublicResultsPage />
        }
      ]
    }
  ]
}

export { PublicResultsRoutes }
