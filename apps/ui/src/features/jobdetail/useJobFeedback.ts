import { skipToken } from '@reduxjs/toolkit/query'
import type { JobFeedbackDTO } from '@bilbomd/bilbomd-types'
import { useGetPublicFeedbackDataQuery } from 'slices/publicJobsApiSlice'
import type { JobSource } from './jobSource'
import type { JobView } from './jobView'
import { analysisTabs } from './jobPageModel'

// The fit assessment of a completed job. Owners get it with the job itself;
// a public results page fetches it by token (the Feedback & Validation tab
// makes the same request, so it is only sent once).
export const useJobFeedback = (
  source: JobSource,
  view: JobView | undefined
): JobFeedbackDTO | undefined => {
  const expected =
    view?.status === 'Completed' &&
    analysisTabs(view.jobType).includes('feedback')
  const { data } = useGetPublicFeedbackDataQuery(
    expected && source.kind === 'public' ? source.token : skipToken
  )
  if (!expected) return undefined
  return source.kind === 'owner' ? view?.feedback : data
}
