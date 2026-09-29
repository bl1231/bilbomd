import { Navigate, useParams } from 'react-router'
import { skipToken } from '@reduxjs/toolkit/query'
import CircularProgress from '@mui/material/CircularProgress'
import useAuth from 'hooks/useAuth'
import { useGetPublicJobByIdQuery } from 'slices/publicJobsApiSlice'
import { useGetJobByIdQuery } from 'slices/jobsApiSlice'
import PublicJobPage from 'features/public/PublicJobPage'

// Entry point for emailed results links. A logged-in user who can open the
// job in their dashboard (owner, or Admin/Manager) is sent to the full job
// page; everyone else gets the public results page.
const PublicResultsPage = () => {
  const { isAuthenticated } = useAuth()
  const { publicId } = useParams<{ publicId: string }>()

  const { data: publicJob, isLoading: publicLoading } =
    useGetPublicJobByIdQuery(isAuthenticated && publicId ? publicId : skipToken)

  const jobId = isAuthenticated ? publicJob?.jobId : undefined

  // 404s for jobs the user can't access, so success means ownership
  const { isSuccess: canViewInDashboard, isFetching: ownershipLoading } =
    useGetJobByIdQuery(jobId ?? skipToken)

  if (!isAuthenticated) return <PublicJobPage />

  if (publicLoading || ownershipLoading) return <CircularProgress />

  if (jobId && canViewInDashboard) {
    return (
      <Navigate
        to={`/dashboard/jobs/${jobId}`}
        replace
      />
    )
  }

  return <PublicJobPage />
}

export default PublicResultsPage
