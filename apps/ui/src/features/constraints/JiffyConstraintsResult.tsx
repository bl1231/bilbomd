import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Stack,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CopyToClipboardButton from 'components/Common/CopyToClipboardButton'
import { MDConstraintsSection } from 'features/results/components/MDConstraintsSection'
import type { JiffyConstraints } from './useJiffyConstraints'
import { UseInClassicJobButton } from './UseInClassicJobButton'
import DownloadButton from './DownloadTextButton'

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
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? '#0c2a4a' : '#bae0ff',
          color: (theme) =>
            theme.palette.mode === 'dark'
              ? theme.palette.text.primary
              : 'black',
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

interface JiffyConstraintsResultProps {
  result: JiffyConstraints
  /** The structure the Jiffy worked on, for the hand-off */
  structure: File | null
  /** For the Classic form's note: "the Inp Jiffy™" */
  from: string
  /** Called once a constraints file has been downloaded */
  onDownload?: () => void
  /** Shown instead of the drawing when there are no bodies */
  empty?: string
}

/**
 * What a Jiffy made, shown the same way in both Jiffys: the bodies drawn as
 * the job form and job page draw them, what BilboMD would refuse, the
 * hand-off to a new Classic job, and the constraints as a const.inp or an
 * openmm_const.yml to download or copy.
 */
export const JiffyConstraintsResult = ({
  result,
  structure,
  from,
  onDownload,
  empty = 'No fixed or rigid bodies yet.'
}: JiffyConstraintsResultProps) => {
  const { constInp, checked, valid, drawn, openmmYaml } = result
  // Empty while the PAE Jiffy's const.inp is still being fetched, or if that
  // failed: nothing to download yet
  const constInpFile = constInp.trim() === '' ? null : constInp
  return (
    <Stack spacing={2}>
      {drawn ? (
        <Box data-testid="jiffy-constraints">
          <MDConstraintsSection constraints={drawn} />
        </Box>
      ) : (
        <Typography color="text.secondary">{empty}</Typography>
      )}

      {checked && !checked.ok && (
        <Alert
          severity="warning"
          data-testid="jiffy-constraints-errors"
        >
          <Typography variant="body2">
            BilboMD would refuse these constraints for a job with this
            structure:
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
          structure={structure}
          constInp={constInp}
          from={from}
          disabled={!valid}
        />
        <DownloadButton
          content={constInpFile}
          fileName="const.inp"
          onDownload={onDownload}
        />
        <DownloadButton
          content={openmmYaml}
          fileName="openmm_const.yml"
          onDownload={onDownload}
        />
      </Stack>

      {constInpFile && (
        <FileText
          title="Show the const.inp text"
          text={constInpFile}
          testId="const-inp-text"
        />
      )}
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
        Segment IDs (segid) are written the way BilboMD builds your structure,
        so they may differ from those in other files.
      </Typography>
    </Stack>
  )
}

export default JiffyConstraintsResult
