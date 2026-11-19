import { useMemo } from 'react'
import { useFormikContext, FormikValues } from 'formik'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Stack,
  Typography
} from '@mui/material'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import { Box } from '@mui/system'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { stringify as stringifyYaml } from 'yaml'
import {
  importConstraintsFromConstInp,
  readPdbSegments,
  toOpenMMConstraints,
  validateConstraintsInput
} from '@bilbomd/bilbomd-types'
import useTitle from 'hooks/useTitle'
import CopyToClipboardButton from 'components/Common/CopyToClipboardButton'
import HeaderBox from 'components/HeaderBox'
import { RigidBody, Chain } from 'types/interfaces'
import { MDConstraintsSection } from 'features/results/components/MDConstraintsSection'
import { constraintsFromConstInp } from 'features/constraintSchematic/constInpConstraints'
import { previewConstraints } from 'features/constraints/previewConstraints'
import { UseInClassicJobButton } from 'features/constraints/UseInClassicJobButton'
import DownloadButton from '../Helpers/Download'
import { buildConstInp } from '../Helpers/constInpText'

const FileText = ({
  title,
  text,
  testId
}: {
  title: string
  text: string
  testId: string
}) => (
  <Accordion
    disableGutters
    variant="outlined"
  >
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography variant="body2">{title}</Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          p: 2,
          backgroundColor: '#bae0ff',
          color: 'black',
          borderRadius: 1
        }}
      >
        <Box sx={{ alignSelf: 'end' }}>
          <CopyToClipboardButton text={text} />
        </Box>
        <pre
          style={{ margin: 0 }}
          data-testid={testId}
        >
          <code>{text}</code>
        </pre>
      </Box>
    </AccordionDetails>
  </Accordion>
)

/**
 * The jiffy's last step: the bodies drawn the way the job form and job page
 * show them, checked the way BilboMD will check them for a PDB job (OpenMM),
 * with the constraints file to take away as a const.inp or an OpenMM
 * constraints YAML, or straight into a new BilboMD Classic job.
 */
interface PreviewProps {
  /** Called once a constraints file has been downloaded */
  onDone?: () => void
}

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
    () => (pdbSrc ? readPdbSegments(pdbSrc) : []),
    [pdbSrc]
  )
  // The const.inp read back the way a job form reads it
  const checked = useMemo(() => {
    if (segments.length === 0) return null
    const imported = importConstraintsFromConstInp(constInp, 'pdb', {
      structure: segments
    })
    if (!imported.input) return null
    return validateConstraintsInput(imported.input, {
      mode: 'pdb',
      segments,
      engine: 'openmm'
    })
  }, [constInp, segments])
  const valid = checked?.ok ? checked.constraints : null

  const drawn = useMemo(
    () =>
      valid
        ? previewConstraints(valid, segments)
        : constraintsFromConstInp(constInp),
    [valid, segments, constInp]
  )
  const openmmYaml = useMemo(
    () =>
      valid
        ? stringifyYaml(
            { constraints: toOpenMMConstraints(valid) },
            { indent: 2, lineWidth: 0 }
          )
        : null,
    [valid]
  )

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
              job, or download them as a constraints file. Either file works for{' '}
              <b>BilboMD Classic</b> and <b>BilboMD SANS</b> jobs, with either
              MD engine.
            </Typography>

            {drawn ? (
              <Box data-testid="const-inp-jiffy-constraints">
                <MDConstraintsSection constraints={drawn} />
              </Box>
            ) : (
              <Typography color="text.secondary">
                No fixed or rigid bodies yet. Go back to add some.
              </Typography>
            )}

            {checked && !checked.ok && (
              <Alert
                severity="warning"
                data-testid="const-inp-jiffy-errors"
              >
                <Typography variant="body2">
                  BilboMD would refuse these constraints for a job with this PDB
                  file:
                </Typography>
                <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                  {checked.errors.map((e) => (
                    <li key={`${e.path}:${e.message}`}>
                      <Typography variant="body2">{e.message}</Typography>
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {checked?.ok &&
              checked.warnings.map((w) => (
                <Alert
                  key={w}
                  severity="warning"
                >
                  {w}
                </Alert>
              ))}

            <Stack
              direction="row"
              spacing={2}
              sx={{ flexWrap: 'wrap', rowGap: 1 }}
            >
              <UseInClassicJobButton
                structure={pdbFile}
                constInp={constInp}
                from={'the Inp Jiffy\u2122'}
                disabled={!valid}
              />
              <DownloadButton
                content={constInp}
                fileName="const.inp"
                onDownload={onDone}
              />
              <DownloadButton
                content={openmmYaml}
                fileName="openmm_const.yml"
                onDownload={onDone}
              />
            </Stack>

            <FileText
              title="Show the const.inp text"
              text={constInp}
              testId="const-inp-text"
            />
            {openmmYaml && (
              <FileText
                title="Show the openmm_const.yml text"
                text={openmmYaml}
                testId="openmm-yaml-text"
              />
            )}
            <Typography
              variant="caption"
              color="text.secondary"
            >
              Segment IDs (segid) are written the way BilboMD builds your PDB
              file, so they may differ from those in other files.
            </Typography>
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  )
}

export { Preview }
