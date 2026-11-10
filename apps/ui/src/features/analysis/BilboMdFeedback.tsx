import { useMemo } from 'react'
import { Alert, AlertTitle, Skeleton, Stack } from '@mui/material'
import Grid from '@mui/material/Grid'
import type { FoxsData, JobFeedbackDTO } from '@bilbomd/bilbomd-types'
import Item from 'themes/components/Item'
import { useGetFoxsAnalysisByIdQuery } from 'slices/jobsApiSlice'
import {
  useGetPublicFeedbackDataQuery,
  useGetPublicFoxsDataQuery
} from 'slices/publicJobsApiSlice'
import FeedbackSummary from './FeedbackSummary'
import ResidualsChart from './ResidualsChart'
import {
  FindingsList,
  HowAssessed,
  ModelsTable,
  RegionsTable
} from './FeedbackDetails'
import { findFit, residualPoints, toFeedbackView } from './feedbackModel'

interface FeedbackProps {
  // The owner's job page already has the report
  feedback?: JobFeedbackDTO
  // Owner job id, for the per-point fit data behind the residuals plot
  id?: string
  // Public results token: the report and the fit data are fetched with it
  publicId?: string
}

const BilboMdFeedback = ({ feedback, id, publicId }: FeedbackProps) => {
  const {
    data: fetchedFeedback,
    isLoading,
    error
  } = useGetPublicFeedbackDataQuery(publicId || '', {
    skip: !publicId || !!feedback
  })

  // The same per-point fits the FoXS Analysis tab draws. They add the
  // residuals plot and the χ²free / Vr values; the report stands without them.
  const ownerFoxs = useGetFoxsAnalysisByIdQuery(id || '', {
    skip: !id || !!publicId
  })
  const publicFoxs = useGetPublicFoxsDataQuery(publicId || '', {
    skip: !publicId
  })
  const foxsQuery = publicId ? publicFoxs : ownerFoxs
  const foxsData = useMemo(
    () =>
      Array.isArray(foxsQuery.data)
        ? (foxsQuery.data as FoxsData[])
        : undefined,
    [foxsQuery.data]
  )

  const actualFeedback = feedback || fetchedFeedback
  const view = useMemo(
    () => (actualFeedback ? toFeedbackView(actualFeedback) : undefined),
    [actualFeedback]
  )
  const fit = useMemo(
    () => (view ? findFit(foxsData, view.assessed.file) : undefined),
    [foxsData, view]
  )
  const points = useMemo(() => residualPoints(fit), [fit])

  if (isLoading) {
    return (
      <Item>
        <Skeleton
          variant="rounded"
          height={160}
        />
      </Item>
    )
  }

  if (error) {
    return (
      <Alert
        severity="error"
        variant="outlined"
      >
        Failed to load the fit assessment.
      </Alert>
    )
  }

  if (!view) {
    return (
      <Alert
        severity="info"
        variant="outlined"
      >
        <AlertTitle>No fit assessment for this job</AlertTitle>
        The assessment could not be computed when the job finished. The fits
        themselves are on the FoXS Analysis tab.
      </Alert>
    )
  }

  return (
    <Item>
      <Stack
        spacing={3}
        sx={{ p: { xs: 1, md: 2 } }}
      >
        <FeedbackSummary
          view={view}
          fit={fit}
          base={foxsData?.[0]}
        />

        {foxsQuery.isLoading && (
          <Skeleton
            variant="rounded"
            height={300}
          />
        )}
        {points.length > 0 && (
          <ResidualsChart
            points={points}
            regions={view.regions}
          />
        )}

        {view.findings.length > 0 && <FindingsList findings={view.findings} />}

        <Grid
          container
          spacing={3}
        >
          {view.regions.length > 0 && (
            <Grid size={{ xs: 12, md: view.models.length > 0 ? 6 : 12 }}>
              <RegionsTable view={view} />
            </Grid>
          )}
          {view.models.length > 0 && (
            <Grid size={{ xs: 12, md: 6 }}>
              <ModelsTable
                view={view}
                foxsData={foxsData}
              />
            </Grid>
          )}
        </Grid>

        {view.legacy ? (
          <Alert
            severity="info"
            variant="outlined"
          >
            This job was assessed with an earlier version of the analysis, which
            recorded less detail.
          </Alert>
        ) : (
          <HowAssessed />
        )}
      </Stack>
    </Item>
  )
}

export default BilboMdFeedback
