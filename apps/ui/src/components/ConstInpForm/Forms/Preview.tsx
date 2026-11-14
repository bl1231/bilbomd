import { useState, useEffect, useMemo } from 'react'
import { useFormikContext, FormikValues } from 'formik'
import { Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import useTitle from 'hooks/useTitle'
import { Box } from '@mui/system'
import CopyToClipboardButton from 'components/Common/CopyToClipboardButton'
import Download from '../Helpers/Download'
import { RigidBody, Chain } from 'types/interfaces'
import { buildConstInp } from '../Helpers/constInpText'
import HeaderBox from 'components/HeaderBox'
import ConstraintSchematic from 'features/constraintSchematic/ConstraintSchematic'
import { constraintsFromConstInp } from 'features/constraintSchematic/constInpConstraints'

const Preview = () => {
  useTitle('BilboMD: Preview const.inp file')
  const [constFilePreview, setConstFilePreview] = useState('')
  const [constFileBlob, setConstFileBlob] = useState<Blob | null>(null)
  const { values } = useFormikContext<FormikValues>()
  const rigid_bodies = values.pdb_file.rigid_bodies as RigidBody[]
  const chains = values.pdb_file.chains as Chain[]

  useEffect(() => {
    const content = buildConstInp(rigid_bodies, chains)
    setConstFilePreview(content)
    setConstFileBlob(new Blob([content], { type: 'text/plain' }))
  }, [rigid_bodies, chains])

  // The file above as bodies, for the schematic
  const constraints = useMemo(
    () => constraintsFromConstInp(constFilePreview),
    [constFilePreview]
  )

  return (
    <>
      <Grid container>
        <Grid>
          <HeaderBox>
            <Typography>Preview</Typography>
          </HeaderBox>
          <Paper sx={{ p: 1 }}>
            <Typography sx={{ m: 2 }}>
              This is the <code>const.inp</code> definition file with your Rigid
              Bodies and defined in a format that CHARMM will understand. You
              can either copy and paste the file shown below or, if you prefer,
              you can use the Download button.
            </Typography>
            <Typography sx={{ m: 2 }}>
              The <code>segid</code> values have been modified to ensure
              compatability with CHARMM.
            </Typography>
            <Box sx={{ display: 'flex' }}>
              <Grid
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  p: 2,
                  m: 1,
                  backgroundColor: '#bae0ff',
                  color: 'black',
                  borderRadius: 1,
                  // alignItems: 'center',
                  flex: '0 1 100%'
                  // justifyContent: 'space-between'
                }}
              >
                <Box sx={{ alignSelf: 'end' }}>
                  <CopyToClipboardButton text={constFilePreview} />
                </Box>

                <pre>
                  <code>{constFilePreview}</code>
                </pre>
              </Grid>
            </Box>
            <Download file={constFileBlob} />
            {constraints && (
              <Box
                sx={{ m: 2, mt: 3 }}
                data-testid="const-inp-jiffy-schematic"
              >
                <Typography
                  variant="h6"
                  sx={{ mb: 1 }}
                >
                  How these constraints move
                </Typography>
                <ConstraintSchematic constraints={constraints} />
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </>
  )
}

export { Preview }
