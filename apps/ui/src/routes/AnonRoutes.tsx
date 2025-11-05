import { lazy } from 'react'

import Loadable from 'components/Loadable'
// import MainLayout from 'layout/MainLayout'
import AnonLayout from 'layout/AnonLayout'
const Welcome = Loadable(lazy(() => import('features/auth/Welcome')))
const NewJobForm = Loadable(lazy(() => import('features/jobs/NewJobForm')))
const SingleJobPage = Loadable(
  lazy(() => import('features/jobs/SingleJobPage'))
)
const ResubmitJob = Loadable(
  lazy(() => import('features/jobs/ResubmitJobForm'))
)
const NewAutoJob = Loadable(
  lazy(() => import('features/autojob/NewAutoJobForm'))
)
const ResubmitAutoJob = Loadable(
  lazy(() => import('features/autojob/ResubmitAutoJobForm'))
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
const NewMultiJob = Loadable(
  lazy(() => import('features/multimd/NewMultiMDJobForm'))
)
const ConstInpStepper = Loadable(
  lazy(() => import('components/ConstInpForm/ConstInpStepper'))
)
const AF2PAEJiffy = Loadable(lazy(() => import('features/af2pae/PAEJiffy')))
const Help = Loadable(lazy(() => import('features/help/Help')))
const SampleData = Loadable(
  lazy(() => import('features/sample-data/SampleData'))
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
      element: <NewJobForm />
    },
    {
      path: 'jobs/classic/new/resubmit/:id',
      element: <ResubmitJob />
    },
    {
      path: 'jobs/auto/new',
      element: <NewAutoJob />
    },
    {
      path: 'jobs/auto/new/resubmit/:id',
      element: <ResubmitAutoJob />
    },
    {
      path: 'jobs/alphafold/new',
      element: <NewAlphaFoldJob />
    },
    {
      path: 'jobs/sans/new',
      element: <NewSANSJob />
    },
    {
      path: 'jobs/scoper/new',
      element: <NewScoperJob />
    },
    {
      path: 'jobs/multimd/new',
      element: <NewMultiJob />
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
      element: <SingleJobPage />
    },
    {
      path: 'help',
      element: <Help />
    },
    {
      path: 'sample-data',
      element: <SampleData />
    }
  ]
}

export { AnonRoutes }
