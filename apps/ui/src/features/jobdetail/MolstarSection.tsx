import { lazy, Suspense, useState } from 'react'
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

const MolstarViewer = lazy(() => import('features/molstar/Viewer'))

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
        <Typography>
          Molstar Viewer
          <Box
            component="span"
            sx={{ ml: 1, color: 'yellow', fontSize: '0.75em' }}
          >
            experimental
          </Box>
        </Typography>
      </HeaderBox>
      {loaded && results ? (
        <>
          <Suspense fallback={<CircularProgress />}>
            <MolstarViewer
              id={view.id}
              jobType={view.jobType}
              results={results}
              constraints={view.md_constraints}
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
