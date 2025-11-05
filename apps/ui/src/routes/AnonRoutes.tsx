import { lazy } from 'react'

// project import
import Loadable from 'components/Loadable'
import MainLayout from 'layout/MainLayout'

// settings-related components
const SettingsLayout = Loadable(lazy(() => import('features/users/Settings')))
const Preferences = Loadable(lazy(() => import('features/users/Preferences')))
const Security = Loadable(lazy(() => import('features/users/Security')))
const SafetyZone = Loadable(lazy(() => import('features/users/SafetyZone')))
const APITokenManager = Loadable(
  lazy(() => import('features/users/ApiTokenManagement'))
)

// render - dashboard
const NewJobForm = Loadable(lazy(() => import('features/jobs/NewJobForm')))
const NewAutoJob = Loadable(
  lazy(() => import('features/autojob/NewAutoJobForm'))
)
const About = Loadable(lazy(() => import('features/about/About')))
const NewAlphaFoldJob = Loadable(
  lazy(() => import('features/alphafoldjob/NewAlphaFoldJobForm'))
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
const Welcome = Loadable(lazy(() => import('features/auth/Welcome')))
const Missing = Loadable(lazy(() => import('components/Missing')))

// ===========================|| ANON ROUTING ||============================ //

const AnonRoutes = {
  element: <MainLayout />,
  path: '/',
  children: [
    {
      index: true,
      element: <Welcome />
    },
    {
      path: 'welcome',
      element: <Welcome />
    },
    {
      path: 'about',
      element: <About title="BilboMD: About" />
    },
    {
      path: 'jobs/classic',
      element: <NewJobForm />
    },
    {
      path: 'jobs/auto',
      element: <NewAutoJob />
    },
    {
      path: 'jobs/alphafold',
      element: <NewAlphaFoldJob />
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
      path: 'settings',
      element: <SettingsLayout />,
      children: [
        { index: true, element: <APITokenManager /> },
        { path: 'preferences', element: <Preferences /> },
        { path: 'security', element: <Security /> },
        { path: 'safety', element: <SafetyZone /> },
        { path: 'api-tokens', element: <APITokenManager /> }
      ]
    },
    {
      path: '*',
      element: <Missing />
    }
  ]
}

export { AnonRoutes }
