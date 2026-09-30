import { useParams } from 'react-router'
import { Alert, AlertTitle } from '@mui/material'
import useTitle from 'hooks/useTitle'
import JobDetailPage from 'features/jobdetail/JobDetailPage'

const PublicJobPage = () => {
  useTitle('BilboMD: Job Status')
  const { publicId } = useParams<{ publicId: string }>()

  if (!publicId) {
    return (
      <Alert severity="error">
        <AlertTitle>Missing job id</AlertTitle>
        No public job id was provided in the URL.
      </Alert>
    )
  }

  return <JobDetailPage source={{ kind: 'public', token: publicId }} />
}

export default PublicJobPage
