import { lazy, Suspense, useMemo, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  Typography
} from '@mui/material'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import HeaderBox from 'components/HeaderBox'
import { sourceProps, type JobSource } from './jobSource'
import type { JobView } from './jobView'
import { readAutoLoad, writeAutoLoad } from './molstarAutoLoad'
import { useGetJobAlignmentQuery } from 'slices/jobsApiSlice'
import { useGetPublicJobAlignmentQuery } from 'slices/publicJobsApiSlice'
import {
  alignmentDomainColoring,
  mdConstraintsColoring,
  type DomainColoring
} from 'features/molstar/domainColoring'

const MolstarViewer = lazy(() => import('features/molstar/Viewer'))

// What "Color by Domain" paints: the job's MD constraints or, for a BioEmu2
// job (which has none), the rigid domains found in its sampled structures.
// Undefined hides the button.
const useDomainColoring = (
  source: JobSource,
  view: JobView
): DomainColoring | undefined => {
  const bioemu = view.jobType === 'bioemu'
  const owner = useGetJobAlignmentQuery(
    bioemu && source.kind === 'owner' ? source.id : skipToken
  )
  const anon = useGetPublicJobAlignmentQuery(
    bioemu && source.kind === 'public' ? source.token : skipToken
  )
  const report = source.kind === 'owner' ? owner.data : anon.data
  const rigidDomains = useMemo(() => alignmentDomainColoring(report), [report])
  const constraints = useMemo(
    () => mdConstraintsColoring(view.md_constraints),
    [view.md_constraints]
  )
  return bioemu ? rigidDomains : constraints
}

// Molstar fetches and parses every model PDB (~10 MB for a 5-ensemble job)
// on the main thread, so it only mounts when asked for. Once loaded it stays
// mounted for the rest of the visit.
const MolstarSection = ({
  source,
  view
}: {
  source: JobSource
  view: JobView
}) => {
  const [autoLoad, setAutoLoad] = useState(readAutoLoad)
  const [loaded, setLoaded] = useState(autoLoad)
  const { results } = view
  const domainColoring = useDomainColoring(source, view)

  const onAutoLoadChange = (value: boolean) => {
    setAutoLoad(value)
    writeAutoLoad(value)
  }

  const autoLoadToggle = (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={autoLoad}
          onChange={(e) => onAutoLoadChange(e.target.checked)}
        />
      }
      label={
        <Typography variant="body2">
          Always load the 3D viewer automatically
        </Typography>
      }
    />
  )

  return (
    <Grid size={{ xs: 12 }}>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Molstar Viewer</Typography>
      </HeaderBox>
      {loaded && results ? (
        <>
          <Suspense fallback={<CircularProgress />}>
            <MolstarViewer
              id={view.id}
              jobType={view.jobType}
              results={results}
              constraints={domainColoring}
              {...sourceProps(source)}
            />
          </Suspense>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}>
            {autoLoadToggle}
          </Box>
        </>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 1.5,
            px: 2,
            py: 4,
            border: 1,
            borderTop: 0,
            borderColor: 'divider',
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 480 }}
          >
            View the models in 3D. This downloads every model PDB, which can
            take a few seconds for larger jobs.
          </Typography>
          <Button
            variant="contained"
            startIcon={<ViewInArIcon />}
            onClick={() => setLoaded(true)}
          >
            Load 3D Viewer
          </Button>
          {autoLoadToggle}
        </Box>
      )}
    </Grid>
  )
}

export default MolstarSection
