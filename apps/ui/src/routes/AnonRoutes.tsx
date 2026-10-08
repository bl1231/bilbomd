import { lazy } from 'react'
import Loadable from 'components/Loadable'
import PublicLayout from 'layout/PublicLayout'
import SoftPersistLogin from 'features/auth/SoftPersistLogin'
import RedirectIfAuthenticated from 'features/auth/RedirectIfAuthenticated'

const About = Loadable(lazy(() => import('features/about/About')))
const Welcome = Loadable(lazy(() => import('features/auth/Welcome')))
const NewJobForm = Loadable(lazy(() => import('features/jobs/NewJobForm')))
const NewAutoJob = Loadable(
  lazy(() => import('features/autojob/NewAutoJobForm'))
)
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
const Funding = Loadable(lazy(() => import('features/about/Funding')))
const Terms = Loadable(lazy(() => import('features/about/TermsAndConditions')))
const Copyright = Loadable(lazy(() => import('features/about/Copyright')))

// ===========================|| PUBLIC ANON ROUTING ||============================ //

// SoftPersistLogin quietly restores a logged-in session from the refresh
// cookie before these pages render, and PublicLayout then picks the dashboard
// chrome for logged-in users and the anonymous chrome for everyone else. So a
// returning user who arrives cold (hard reload, new tab, emailed link) gets
// the logged-in header. First-time visitors have no persist flag and skip it.
const AnonRoutes = {
  element: <SoftPersistLogin />,
  path: '/',
  children: [
    {
      // Pathless so relative navigation in the layout resolves from '/'
      element: <PublicLayout />,
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
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/classic">
              <NewJobForm mode="anonymous" />
            </RedirectIfAuthenticated>
          )
        },
        {
          path: 'jobs/auto/new',
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/auto">
              <NewAutoJob mode="anonymous" />
            </RedirectIfAuthenticated>
          )
        },
        {
          path: 'jobs/alphafold/new',
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/alphafold">
              <NewAlphaFoldJob mode="anonymous" />
            </RedirectIfAuthenticated>
          )
        },
        {
          path: 'jobs/openfold/new',
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/openfold">
              <NewOpenFoldJob mode="anonymous" />
            </RedirectIfAuthenticated>
          )
        },
        {
          path: 'jobs/sans/new',
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/sans">
              <NewSANSJob mode="anonymous" />
            </RedirectIfAuthenticated>
          )
        },
        {
          path: 'jobs/scoper/new',
          element: (
            <RedirectIfAuthenticated to="/dashboard/jobs/scoper">
              <NewScoperJob mode="anonymous" />
            </RedirectIfAuthenticated>
          )
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
        },
        {
          path: 'funding',
          element: <Funding />
        },
        {
          path: 'terms',
          element: <Terms />
        },
        {
          path: 'copyright',
          element: <Copyright />
        }
      ]
    }
  ]
}

export { AnonRoutes }
