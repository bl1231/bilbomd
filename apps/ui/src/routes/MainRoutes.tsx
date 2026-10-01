import { lazy } from 'react'
import { Navigate } from 'react-router'

// project import
import Loadable from 'components/Loadable'
import MainLayout from 'layout/MainLayout'

// our Dave Gray redux Authentication wrapper
import RequireAuth from 'features/auth/RequireAuth'
import PersistLogin from 'features/auth/PersistLogin'
import { ROLES } from 'config/roles'

// settings-related components
const SettingsLayout = Loadable(lazy(() => import('features/users/Settings')))
const Preferences = Loadable(lazy(() => import('features/users/Preferences')))
const Profile = Loadable(lazy(() => import('features/users/Profile')))
const ChangeEmail = Loadable(lazy(() => import('features/users/ChangeEmail')))
const DeleteAccount = Loadable(
  lazy(() => import('features/users/DeleteAccount'))
)
const APITokenManager = Loadable(
  lazy(() => import('features/users/ApiTokenManagement'))
)

// render - dashboard
const Prefetch = Loadable(lazy(() => import('features/auth/Prefetch')))
const NewJobForm = Loadable(lazy(() => import('features/jobs/NewJobForm')))
const ResubmitJob = Loadable(
  lazy(() => import('features/jobs/ResubmitJobForm'))
)
const NewAutoJob = Loadable(
  lazy(() => import('features/autojob/NewAutoJobForm'))
)
const ResubmitAutoJob = Loadable(
  lazy(() => import('features/autojob/ResubmitAutoJobForm'))
)
const About = Loadable(lazy(() => import('features/about/About')))

const NewAlphaFoldJob = Loadable(
  lazy(() => import('features/alphafoldjob/NewAlphaFoldJobForm'))
)
const NewOpenFoldJob = Loadable(
  lazy(() => import('features/openfoldjob/NewOpenFoldJobForm'))
)
const NewSANSJob = Loadable(
  lazy(() => import('features/sansjob/NewSANSJobForm'))
)
const NewScoperJob = Loadable(
  lazy(() => import('features/scoperjob/NewScoperJobForm'))
)
const NewMultiJob = Loadable(
  lazy(() => import('features/multimd/NewMultiMDJobForm'))
)
const ConstInpStepper = Loadable(
  lazy(() => import('components/ConstInpForm/ConstInpStepper'))
)
const AF2PAEJiffy = Loadable(lazy(() => import('features/af2pae/PAEJiffy')))
const Jobs = Loadable(lazy(() => import('features/jobs/Jobs')))
const SingleJobPage = Loadable(
  lazy(() => import('features/jobs/SingleJobPage'))
)
const Welcome = Loadable(lazy(() => import('features/auth/Welcome')))
const UsersList = Loadable(lazy(() => import('features/users/UsersList')))
const EditUser = Loadable(lazy(() => import('features/users/EditUser')))
const AdminPanel = Loadable(lazy(() => import('features/admin/AdminPanel')))
const QueueDetailsPage = Loadable(
  lazy(() => import('features/admin/QueueDetailsPage'))
)
const Unauthorized = Loadable(lazy(() => import('components/Unauthorized')))
const Missing = Loadable(lazy(() => import('components/Missing')))
const Help = Loadable(lazy(() => import('features/help/Help')))

// ===========================|| MAIN ROUTING ||============================ //

const ProtectedMainRoutes = {
  element: <PersistLogin />,
  children: [
    {
      element: <MainLayout />,
      path: '/',
      children: [
        {
          index: true,
          element: <Welcome mode="authenticated" />
        },
        {
          path: 'welcome',
          element: <Welcome mode="authenticated" />
        },
        {
          element: <RequireAuth allowedRoles={[ROLES.Admin]} />,
          children: [
            {
              path: 'admin',
              element: <AdminPanel />
            },
            {
              path: 'queue/:queueName',
              element: <QueueDetailsPage />
            }
          ]
        },
        {
          element: <RequireAuth allowedRoles={[...Object.values(ROLES)]} />,
          children: [
            {
              path: 'unauthorized',
              element: <Unauthorized />
            }
          ]
        },
        {
          element: <RequireAuth allowedRoles={[...Object.values(ROLES)]} />,
          children: [
            {
              element: <Prefetch />,
              children: [
                {
                  path: 'dashboard',
                  children: [
                    { path: '', element: <Welcome mode="authenticated" /> },
                    {
                      path: 'about',
                      element: <About title="BilboMD: About" />
                    },
                    {
                      path: 'about',
                      element: <About title="BilboMD: About" />
                    },
                    {
                      path: 'help',
                      element: <Help title="BilboMD: Help" />
                    },
                    {
                      element: (
                        <RequireAuth
                          allowedRoles={[ROLES.Manager, ROLES.Admin]}
                        />
                      ),
                      children: [
                        {
                          path: 'users',
                          element: <UsersList />
                        },
                        {
                          path: 'users/:id',
                          element: <EditUser />
                        }
                      ]
                    },
                    {
                      path: 'jobs/*',
                      element: <Jobs />,
                      children: [
                        {
                          index: true,
                          element: <Jobs />
                        }
                      ]
                    },
                    {
                      path: 'jobs/:id',
                      element: <SingleJobPage />
                    },
                    {
                      path: 'jobs/classic',
                      element: <NewJobForm />
                    },
                    {
                      path: 'jobs/classic/resubmit/:id',
                      element: <ResubmitJob />
                    },
                    {
                      path: 'jobs/auto',
                      element: <NewAutoJob />
                    },
                    {
                      path: 'jobs/auto/resubmit/:id',
                      element: <ResubmitAutoJob />
                    },
                    {
                      path: 'jobs/alphafold',
                      element: <NewAlphaFoldJob />
                    },
                    {
                      path: 'jobs/openfold',
                      element: <NewOpenFoldJob />
                    },
                    {
                      path: 'jobs/sans',
                      element: <NewSANSJob />
                    },
                    {
                      path: 'jobs/scoper',
                      element: <NewScoperJob />
                    },
                    {
                      path: 'jobs/multimd',
                      element: <NewMultiJob />
                    },
                    {
                      path: 'jobs/constinp',
                      element: <ConstInpStepper />
                    },
                    {
                      path: 'af2pae',
                      element: <AF2PAEJiffy />
                    },
                    {
                      path: 'account',
                      element: (
                        <Navigate
                          to="/settings"
                          replace
                        />
                      )
                    }
                  ]
                },
                {
                  path: 'settings',
                  element: <SettingsLayout />,
                  children: [
                    { index: true, element: <Profile /> },
                    { path: 'profile', element: <Profile /> },
                    { path: 'preferences', element: <Preferences /> },
                    { path: 'email', element: <ChangeEmail /> },
                    { path: 'api-tokens', element: <APITokenManager /> },
                    { path: 'delete-account', element: <DeleteAccount /> },
                    {
                      path: 'security',
                      element: (
                        <Navigate
                          to="/settings/email"
                          replace
                        />
                      )
                    },
                    {
                      path: 'safety',
                      element: (
                        <Navigate
                          to="/settings/delete-account"
                          replace
                        />
                      )
                    }
                  ]
                },
                {
                  path: '*',
                  element: <Missing />
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

export { ProtectedMainRoutes }
