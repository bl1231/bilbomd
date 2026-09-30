import { useParams } from 'react-router'
import useTitle from 'hooks/useTitle'
import MissingJob from 'components/MissingJob'
import JobDetailPage from 'features/jobdetail/JobDetailPage'

const SingleJobPage = () => {
  useTitle('BilboMD: Job Details')
  const { id } = useParams()

  if (!id) return <MissingJob id={id} />

  return <JobDetailPage source={{ kind: 'owner', id }} />
}

export default SingleJobPage
