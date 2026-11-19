import { useMemo } from 'react'
import { useFormikContext, FormikValues } from 'formik'
import { Stack, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import { readPdbSegments } from '@bilbomd/bilbomd-types'
import useTitle from 'hooks/useTitle'
import HeaderBox from 'components/HeaderBox'
import { RigidBody, Chain } from 'types/interfaces'
import { JiffyConstraintsResult } from 'features/constraints/JiffyConstraintsResult'
import { useJiffyConstraints } from 'features/constraints/useJiffyConstraints'
import { buildConstInp } from '../Helpers/constInpText'

interface PreviewProps {
  /** Called once a constraints file has been downloaded */
  onDone?: () => void
}

/**
 * The jiffy's last step: its bodies drawn and checked the way BilboMD will
 * check them, to take straight into a new BilboMD Classic job or download as
 * a const.inp or an OpenMM constraints YAML.
 */
const Preview = ({ onDone }: PreviewProps) => {
  useTitle('BilboMD: Preview constraints')
  const { values } = useFormikContext<FormikValues>()
  const rigid_bodies = values.pdb_file.rigid_bodies as RigidBody[]
  const chains = values.pdb_file.chains as Chain[]
  const pdbFile = values.pdb_file.file as File | null
  const pdbSrc = values.pdb_file.src as string | null

  const constInp = useMemo(
    () => buildConstInp(rigid_bodies, chains),
    [rigid_bodies, chains]
  )
  // The PDB's segments as BilboMD builds them
  const segments = useMemo(
    () => (pdbSrc ? readPdbSegments(pdbSrc) : null),
    [pdbSrc]
  )
  const result = useJiffyConstraints(constInp, segments)

  return (
    <Grid container>
      <Grid sx={{ width: '100%' }}>
        <HeaderBox>
          <Typography>Preview</Typography>
        </HeaderBox>
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography>
              These are your fixed and rigid bodies. Every residue in neither
              stays flexible during MD. Use them in a new <b>BilboMD Classic</b>{' '}
              job, or download them as a constraints file. Either file works for
              a <b>BilboMD Classic</b> or <b>BilboMD SANS</b> job that starts
              from a PDB file. For a CHARMM job from CRD/PSF files, use the{' '}
              <code>const.inp</code>; its segids must match those in your PSF.
            </Typography>
            <JiffyConstraintsResult
              result={result}
              structure={pdbFile}
              from={'the Inp Jiffy™'}
              onDownload={onDone}
              empty="No fixed or rigid bodies yet. Go back to add some."
            />
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  )
}

export { Preview }
