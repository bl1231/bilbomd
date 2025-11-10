import { lazy } from 'react'
import Loadable from 'components/Loadable'
import AnonLayout from 'layout/AnonLayout'
import About from 'features/about/About'

const Welcome = Loadable(lazy(() => import('features/auth/Welcome')))
const NewJobForm = Loadable(lazy(() => import('features/jobs/NewJobForm')))
const PublicJobPage = Loadable(
  lazy(() => import('features/public/PublicJobPage'))
)
const NewAutoJob = Loadable(
  lazy(() => import('features/autojob/NewAutoJobForm'))
)
const NewAlphaFoldJob = Loadable(
  lazy(() => import('features/alphafoldjob/NewAlphaFoldJobForm'))
)
const NewSANSJob = Loadable(
  lazy(() => import('features/sansjob/NewSANSJobForm'))
)
const NewScoperJob = Loadable(
  lazy(() => import('features/scoperjob/NewScoperJobForm'))
)
const ConstInpStepper = Loadable(
  lazy(() => import('components/ConstInpForm/ConstInpStepper'))
)
const AF2PAEJiffy = Loadable(lazy(() => import('features/af2pae/PAEJiffy')))
const Help = Loadable(lazy(() => import('features/help/Help')))
const SampleData = Loadable(
  lazy(() => import('features/sample-data/SampleData'))
)
const PrivacyPolicy = Loadable(
  lazy(() => import('features/privacy/PrivacyPolicy'))
)

// ===========================|| PUBLIC ANON ROUTING ||============================ //

const AnonRoutes = {
  element: <AnonLayout />,
  path: '/',
  children: [
    {
      path: 'welcome',
      element: <Welcome mode="anonymous" />
    },
    {
      index: true,
      element: <Welcome mode="anonymous" />
    },
    {
      path: 'jobs/classic/new',
      element: <NewJobForm mode="anonymous" />
    },
    {
      path: 'jobs/auto/new',
      element: <NewAutoJob mode="anonymous" />
    },
    {
      path: 'jobs/alphafold/new',
      element: <NewAlphaFoldJob mode="anonymous" />
    },
    {
      path: 'jobs/sans/new',
      element: <NewSANSJob mode="anonymous" />
    },
    {
      path: 'jobs/scoper/new',
      element: <NewScoperJob mode="anonymous" />
    },
    {
      path: 'jiffy/inp',
      element: <ConstInpStepper />
    },
    {
      path: 'jiffy/pae',
      element: <AF2PAEJiffy />
    },
    {
      path: 'results/:publicId',
      element: <PublicJobPage />
    },
    {
      path: 'help',
      element: <Help />
    },
    {
      path: 'about',
      element: <About title="BilboMD: About" />
    },
    {
      path: 'sample-data',
      element: <SampleData />
    },
    {
      path: 'privacy',
      element: <PrivacyPolicy />
    }
  ]
}

export { AnonRoutes }
