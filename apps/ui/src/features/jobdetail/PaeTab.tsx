import { skipToken } from '@reduxjs/toolkit/query'
import { Alert, Box, Grid, Link, Skeleton, Typography } from '@mui/material'
import { useGetJobImageQuery } from 'slices/jobsApiSlice'
import { useGetPublicJobImageQuery } from 'slices/publicJobsApiSlice'
import PAEMatrixPlotExplanation from 'features/af2pae/PAEMatrixPlotExplanation'
import type { JobSource } from './jobSource'

const PAE_IMAGES = [
  {
    filename: 'pae.png',
    title: 'PAE matrix',
    caption: 'Predicted aligned error for every residue pair (0–31 Å).'
  },
  {
    filename: 'viz.png',
    title: 'Rigid bodies',
    caption:
      'Boxes mark the clusters used to build the MD constraints: red tint for rigid bodies, blue tint for fixed regions. Magenta outlines mark separate segments of one cluster.'
  }
] as const

type PaeImageName = (typeof PAE_IMAGES)[number]['filename']

const useJobImage = (source: JobSource, filename: PaeImageName) => {
  const owner = useGetJobImageQuery(
    source.kind === 'owner' ? { id: source.id, filename } : skipToken
  )
  const anon = useGetPublicJobImageQuery(
    source.kind === 'public' ? { publicId: source.token, filename } : skipToken
  )
  return source.kind === 'owner' ? owner : anon
}

const PaeImage = ({
  source,
  filename,
  title,
  caption
}: {
  source: JobSource
  filename: PaeImageName
  title: string
  caption: string
}) => {
  const { data: src, isLoading, isError } = useJobImage(source, filename)

  return (
    <Box
      component="figure"
      sx={{ m: 0 }}
    >
      <Typography
        variant="subtitle1"
        component="figcaption"
        sx={{ fontWeight: 500 }}
      >
        {title}
      </Typography>
      {isLoading && (
        <Skeleton
          variant="rectangular"
          sx={{ width: '100%', aspectRatio: '1', height: 'auto' }}
        />
      )}
      {isError && (
        <Alert severity="info">{title} isn't available for this job.</Alert>
      )}
      {src && (
        <Link
          href={src}
          target="_blank"
          rel="noopener"
          aria-label={`Open ${title} full size`}
        >
          <Box
            component="img"
            src={src}
            alt={title}
            sx={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </Link>
      )}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1 }}
      >
        {caption}
      </Typography>
    </Box>
  )
}

// The PAE images pae2const.py made while turning the predicted structure's
// PAE into MD constraints.
const PaeTab = ({ source }: { source: JobSource }) => (
  <Box sx={{ p: 2 }}>
    <Grid
      container
      spacing={2}
    >
      {PAE_IMAGES.map((image) => (
        <Grid
          key={image.filename}
          size={{ xs: 12, md: 6 }}
        >
          <PaeImage
            source={source}
            {...image}
          />
        </Grid>
      ))}
    </Grid>
    <Box sx={{ mt: 2 }}>
      <PAEMatrixPlotExplanation defaultExpanded={false} />
    </Box>
  </Box>
)

export default PaeTab
