import { lazy } from 'react'
import Loadable from 'components/Loadable'
import SoftPersistLogin from 'features/auth/SoftPersistLogin'
import PublicResultsLayout from 'layout/PublicResultsLayout'

const PublicJobPage = Loadable(
  lazy(() => import('features/public/PublicJobPage'))
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
      element: <PublicResultsLayout />,
      children: [
        {
          path: 'results/:publicId',
          element: <PublicJobPage />
        }
      ]
    }
  ]
}

export { PublicResultsRoutes }
