import { CircularProgress, Stack, Typography } from '@mui/material'
import {
  useGetClassicExampleConstraintsQuery,
  type ClassicExampleKey
} from 'slices/publicJobsApiSlice'
import { MDConstraintsSection } from 'features/results/components/MDConstraintsSection'

/**
 * The example data's own fixed and rigid bodies, read-only, shown the way
 * the job page will show them once the example job is submitted.
 */
export const ExampleConstraints = ({
  example
}: {
  example: ClassicExampleKey
}) => {
  const { data, isLoading, isError } =
    useGetClassicExampleConstraintsQuery(example)

  if (isLoading) {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center' }}
      >
        <CircularProgress size={16} />
        <Typography variant="body2">
          Reading the example constraints…
        </Typography>
      </Stack>
    )
  }

  // The job still runs with the example's constraints; only the preview is
  // missing
  if (isError || !data) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
      >
        The example&apos;s own fixed and rigid bodies will be used.
      </Typography>
    )
  }

  return (
    <Stack spacing={1}>
      <Typography
        variant="body2"
        color="text.secondary"
      >
        The example uses these fixed and rigid bodies. Switch to custom data to
        set your own.
      </Typography>
      <MDConstraintsSection constraints={data} />
    </Stack>
  )
}

export default ExampleConstraints
