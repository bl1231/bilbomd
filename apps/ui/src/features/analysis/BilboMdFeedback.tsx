import { Chip, Divider, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import FeedbackChart from './FeedbackChart'
import { IFeedbackData } from '@bilbomd/mongodb-schema/frontend'
import Item from 'themes/components/Item'
import { useGetPublicFeedbackDataQuery } from 'slices/publicJobsApiSlice'
import { Alert, CircularProgress } from '@mui/material'

interface FeedbackProps {
  feedback?: IFeedbackData
  publicId?: string
}

const BilboMdFeedback = ({ feedback, publicId }: FeedbackProps) => {
  const {
    data: fetchedFeedback,
    isLoading,
    error
  } = useGetPublicFeedbackDataQuery(publicId || '', {
    skip: !publicId || !!feedback
  })

  const actualFeedback = feedback || fetchedFeedback

  if (isLoading) {
    return <CircularProgress />
  }

  if (error) {
    return <Alert severity="error">Failed to load feedback data.</Alert>
  }

  if (!actualFeedback) {
    return <Alert severity="info">No feedback data available.</Alert>
  }
  const bestModel =
    actualFeedback.best_model_dat_file || actualFeedback.best_model || ''

  const getChipProps = (value: number) => {
    if (value < 1.2) {
      return { sx: { backgroundColor: 'green' } }
    } else if (value >= 1.2 && value <= 2.0) {
      return { sx: { backgroundColor: '#59a14f' } }
    } else if (value >= 2.0 && value <= 3.0) {
      return { sx: { backgroundColor: '#bdbf20' } }
    } else {
      return { sx: { backgroundColor: '#f44336' } }
    }
  }

  const getChi2ChipBackgroundColor = (overallChiSquare: number): string => {
    if (overallChiSquare < 1.0) {
      return 'green' // Green for values less than 1.0
    } else if (overallChiSquare >= 1.0 && overallChiSquare < 2.0) {
      return '#59a14f' // Yellow for values between 1.0 and 2.0
    } else if (overallChiSquare >= 2.0 && overallChiSquare < 3.0) {
      return '#bdbf20' // Orange for values between 2.0 and 3.0
    } else {
      return '#f44336' // Red for values 3.0 and above
    }
  }

  // The q-regions that were assessed, labelled from the data. A report can
  // cover fewer than three when the data stop at low q.
  const regions = actualFeedback.chi_squares_of_regions.map(
    (chiSquare, index) => ({
      label: `${(actualFeedback.q_ranges[index] ?? 0).toFixed(2)} < q < ${(
        actualFeedback.q_ranges[index + 1] ?? 0
      ).toFixed(2)}`,
      chiSquare,
      residual: actualFeedback.residuals_of_regions[index]
    })
  )

  // The molecular-weight comparison is advisory and can be unavailable
  const formatMw = (value: number | null | undefined): string =>
    typeof value === 'number' ? value.toFixed(1) : 'n/a'

  return (
    <Item>
      <Grid
        container
        spacing={2}
        sx={{ m: 1, display: 'flex', alignItems: 'center' }}
      >
        <Grid size={{ xs: 10 }}>
          <Typography sx={{ fontSize: '1.7em' }}>
            SAXS Model Analysis Report for <b>{bestModel}</b>
          </Typography>
        </Grid>
        {/* Best Chi-Square and Multi-State Info */}
        <Grid
          container
          sx={{ my: 0.5 }}
        >
          <Grid sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.3em' }}>
              Overall Chi<sup>2</sup> :
            </Typography>
            <Chip
              label={actualFeedback.overall_chi_square.toFixed(2)}
              sx={{
                mx: 1,
                fontSize: '1.2em',
                backgroundColor: getChi2ChipBackgroundColor(
                  actualFeedback.overall_chi_square
                )
              }}
            />
          </Grid>
          <Grid sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.3em' }}>Experimental MW:</Typography>
            <Chip
              label={formatMw(actualFeedback.mw_saxs)}
              sx={{ mx: 1, fontSize: '1.2em' }}
            />

            <Typography sx={{ fontSize: '1.3em' }}>kDa</Typography>
          </Grid>
          <Grid sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '1.3em' }}>Model MW:</Typography>
            <Chip
              label={formatMw(actualFeedback.mw_model)}
              sx={{ mx: 1, fontSize: '1.2em' }}
            />

            <Typography sx={{ fontSize: '1.3em' }}>kDa</Typography>
          </Grid>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
        </Grid>
        {regions.length === 3 && (
          <>
            <Grid size={{ xs: 12 }}>
              <FeedbackChart
                data={{
                  q_ranges: actualFeedback.q_ranges,
                  chi_squares_of_regions: actualFeedback.chi_squares_of_regions,
                  residuals_of_regions: actualFeedback.residuals_of_regions
                }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
            </Grid>
          </>
        )}
        {/* Chi-Squares for Regions */}
        <Grid size={{ xs: 6 }}>
          <Typography sx={{ mb: 2, fontSize: '1.7em' }}>
            Chi<sup>2</sup> Values for Regions
          </Typography>

          {regions.map(({ label, chiSquare }) => (
            <Grid
              key={label}
              container
              sx={{
                my: 0.5,
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '55%'
              }}
            >
              <Typography>
                Chi<sup>2</sup> for {label}:
              </Typography>
              <Chip
                sx={{
                  fontSize: '1.2em',
                  width: '100px',
                  ...(getChipProps(chiSquare).sx || {})
                }}
                label={chiSquare.toFixed(2)}
              />
            </Grid>
          ))}
        </Grid>
        {/* Residuals of Regions */}
        <Grid size={{ xs: 6 }}>
          <Typography sx={{ mb: 2, fontSize: '1.7em' }}>
            Mean Residuals of Regions
          </Typography>

          {regions.map(({ label, residual }) => (
            <Grid
              key={label}
              container
              sx={{
                my: 0.5,
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '68%'
              }}
            >
              <Typography>Mean residuals of {label}:</Typography>
              <Chip
                sx={{ fontSize: '1.2em', width: '100px' }}
                label={residual?.toFixed(2) ?? 'n/a'}
              />
            </Grid>
          ))}
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
        </Grid>
        {/* Feedback Reports */}
        <Grid size={{ xs: 12 }}>
          <Typography sx={{ mb: 1, fontSize: '1.2em' }}>
            {actualFeedback.highest_chi_square_feedback}
          </Typography>
          <Typography sx={{ mb: 1, fontSize: '1.2em' }}>
            {actualFeedback.second_highest_chi_square_feedback}
          </Typography>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
        </Grid>
        {/* Feedback and Suggestions */}
        <Grid size={{ xs: 12 }}>
          <Typography sx={{ fontSize: '1.7em' }}>Summary Feedback</Typography>
          <Typography sx={{ m: 1 }}>{actualFeedback.mw_feedback}</Typography>
          <Typography sx={{ m: 1 }}>
            {actualFeedback.overall_chi_square_feedback}
          </Typography>
          <Typography sx={{ m: 1 }}>
            {actualFeedback.regional_chi_square_feedback}
          </Typography>
        </Grid>
      </Grid>
    </Item>
  )
}

export default BilboMdFeedback
