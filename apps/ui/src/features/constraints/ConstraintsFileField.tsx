import { useCallback, useEffect, useMemo, useState } from 'react'
import { useField } from 'formik'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  FormLabel,
  Link,
  Stack,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  validateConstraintsInput,
  writeConstInp,
  type ConstraintMode,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { MDConstraintsSection } from 'features/results/components/MDConstraintsSection'
import {
  CONSTRAINTS_FILE_ACCEPT,
  importConstraintsFile
} from './importConstraintsFile'
import { previewConstraints } from './previewConstraints'
import { readFileText, useStructureSegments } from './useStructureSegments'

/** Where the Jiffy links go: the signed-in dashboard, or the public pages */
export type JiffyLinks = 'dashboard' | 'public'

const JIFFY_PATHS: Record<JiffyLinks, { inp: string; pae: string }> = {
  dashboard: { inp: '/dashboard/jobs/constinp', pae: '/dashboard/af2pae' },
  public: { inp: '/jiffy/inp', pae: '/jiffy/pae' }
}

export interface InitialConstraints {
  /** What they are, lowercase: "the original job's constraints" */
  label: string
  /** Null when they don't fit the structure */
  for: (segments: StructureSegment[]) => ConstraintsInput | null
}

interface ConstraintsFileFieldProps {
  /** Formik field holding ConstraintsInput | null */
  name: string
  mode: ConstraintMode
  /** The structure file picked in the form: PDB/mmCIF, or PSF for CRD jobs */
  structureFile: File | string
  engine: 'charmm' | 'openmm'
  disabled?: boolean
  jiffyLinks?: JiffyLinks
  /**
   * Constraints used until a file is picked: on resubmit, the original
   * job's. Pass a stable object, since it is read again when it changes.
   */
  initial?: InitialConstraints
}

type FileText =
  | { status: 'reading' }
  | { status: 'ready'; text: string }
  | { status: 'error' }

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** "rigid_bodies[1].segments[0].residues" → "Rigid body 2, segment 1" */
const placeOf = (path: string): string => {
  const match = path.match(
    /^(fixed|rigid)_bodies\[(\d+)\](?:\.segments\[(\d+)\])?/
  )
  if (!match) return ''
  const [, kind, body, segment] = match
  const bodyName =
    kind === 'fixed' ? 'Fixed body' : `Rigid body ${Number(body) + 1}`
  return segment === undefined
    ? bodyName
    : `${bodyName}, segment ${Number(segment) + 1}`
}

const Waiting = ({ text }: { text: string }) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{ alignItems: 'center' }}
  >
    <CircularProgress size={16} />
    <Typography variant="body2">{text}</Typography>
  </Stack>
)

const ListAlert = ({
  severity,
  intro,
  items,
  testId
}: {
  severity: 'error' | 'info'
  intro: string
  items: string[]
  testId: string
}) => (
  <Alert
    severity={severity}
    data-testid={testId}
  >
    <Typography variant="body2">{intro}</Typography>
    <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
      {items.map((item) => (
        <li key={item}>
          <Typography variant="body2">{item}</Typography>
        </li>
      ))}
    </ul>
  </Alert>
)

/**
 * The constraints part of a job form: a constraints file, made in the Inp or
 * PAE Jiffy or taken from an earlier job, read here in the browser and
 * checked against the job's structure once both files are picked, with the
 * same checks the server runs. The constraints are then drawn the way the job
 * page will show them. Only the constraints read from the file are sent.
 */
export const ConstraintsFileField = ({
  name,
  mode,
  structureFile,
  engine,
  disabled,
  jiffyLinks = 'dashboard',
  initial
}: ConstraintsFileFieldProps) => {
  const [file, setFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState<FileText | null>(null)
  const [fixedBody, setFixedBody] = useState<number | undefined>(undefined)

  // A file for the other mode (PDB vs CRD/PSF) names segments differently,
  // so a mode change starts over (during render, so there is no stale frame)
  const [currentMode, setCurrentMode] = useState(mode)
  if (currentMode !== mode) {
    setCurrentMode(mode)
    setFile(null)
    setFileText(null)
    setFixedBody(undefined)
  }

  useEffect(() => {
    if (!file) return
    let cancelled = false
    readFileText(file)
      .then((text) => {
        if (!cancelled) setFileText({ status: 'ready', text })
      })
      .catch(() => {
        if (!cancelled) setFileText({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const pickFile = (picked: File) => {
    setFile(picked)
    setFileText({ status: 'reading' })
    setFixedBody(undefined)
  }
  const clearFile = () => {
    setFile(null)
    setFileText(null)
    setFixedBody(undefined)
  }

  const structure = useStructureSegments(structureFile)
  const segments = structure.status === 'ready' ? structure.segments : null
  const structureName = mode === 'crd_psf' ? 'PSF' : 'PDB or CIF'

  const imported = useMemo(
    () =>
      file && segments && fileText?.status === 'ready'
        ? importConstraintsFile(
            fileText.text,
            file.name,
            mode,
            segments,
            fixedBody
          )
        : null,
    [file, segments, fileText, mode, fixedBody]
  )
  const initialInput = useMemo(
    () => (!file && segments && initial ? initial.for(segments) : null),
    [file, segments, initial]
  )
  const blocked =
    !!imported &&
    (imported.problems.length > 0 || imported.fixedChoices.length > 0)
  const input = file
    ? blocked
      ? null
      : (imported?.input ?? null)
    : initialInput

  const result = useMemo(
    () =>
      input && segments
        ? validateConstraintsInput(input, { mode, segments, engine })
        : null,
    [input, segments, mode, engine]
  )
  const value = result?.ok ? input : null

  // What stops the job, for the form's list of errors
  let message: string | undefined
  if (!file && !initial) message = 'Select a constraints file'
  else if (!segments) {
    message = `Select a ${structureName} file to check the constraints`
  } else if (file && fileText?.status !== 'ready') {
    message =
      fileText?.status === 'error'
        ? 'The constraints file could not be read'
        : 'Reading the constraints file'
  } else if (!input) {
    message = file
      ? 'The constraints file cannot be used as it is'
      : 'Select a constraints file'
  } else if (!result?.ok) message = 'Fix the constraints file'

  const validate = useCallback(() => message, [message])
  const [, , helpers] = useField<ConstraintsInput | null>({ name, validate })
  const { setValue } = helpers
  useEffect(() => {
    // Validating again here keeps the error current when the value stays null
    void setValue(value)
    // setValue changes identity on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, message])

  const preview = useMemo(
    () =>
      result?.ok && engine === 'charmm'
        ? writeConstInp(result.constraints)
        : null,
    [result, engine]
  )
  const jiffy = JIFFY_PATHS[jiffyLinks]

  const status = () => {
    if (!file && !initial) return null
    if (structure.status === 'none') {
      return (
        <Typography
          variant="body2"
          color="text.secondary"
        >
          The constraints are checked once the {structureName} file is selected.
        </Typography>
      )
    }
    if (structure.status === 'reading') {
      return <Waiting text="Reading the structure…" />
    }
    if (structure.status === 'error') {
      return <Alert severity="error">{structure.message}</Alert>
    }
    if (file && fileText?.status === 'error') {
      return (
        <Alert severity="error">The constraints file could not be read.</Alert>
      )
    }
    if (file && fileText?.status !== 'ready') {
      return <Waiting text="Reading the constraints file…" />
    }
    if (imported && imported.fixedChoices.length > 1 && fileText) {
      return (
        <Alert
          severity="warning"
          data-testid="fixed-body-choice"
        >
          <Typography
            variant="body2"
            sx={{ mb: 1 }}
          >
            The file has {imported.fixedChoices.length} &quot;cons fix&quot;
            commands, but CHARMM uses only the last one. Which is the fixed
            body?
          </Typography>
          <Stack spacing={0.5}>
            {imported.fixedChoices.map((body, i) => (
              <Button
                // The choices come from one file and never change order
                key={i}
                size="small"
                variant="outlined"
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                onClick={() => setFixedBody(i)}
              >
                {`cons fix #${i + 1}: ${body.segments
                  .map((s) => {
                    const segName = s.segid ?? `chain ${s.chain_id}`
                    return s.residues
                      ? `${segName} ${s.residues.start}–${s.residues.stop}`
                      : `${segName} (whole)`
                  })
                  .join(', ')}`}
              </Button>
            ))}
          </Stack>
        </Alert>
      )
    }
    if (imported && imported.problems.length > 0) {
      return (
        <ListAlert
          severity="error"
          testId="constraints-file-problems"
          intro="BilboMD can't use this file as it is, since these parts of it would be left out. Fix the file, for example in the Inp Jiffy, and select it again."
          items={imported.problems}
        />
      )
    }
    if (!input) {
      return (
        <Alert severity="warning">
          {file
            ? 'The file holds no usable constraints.'
            : `${capitalize(initial?.label ?? 'these constraints')} don't fit this structure. Select a constraints file.`}
        </Alert>
      )
    }
    if (result && !result.ok) {
      return (
        <Alert
          severity="error"
          data-testid="constraints-errors"
        >
          <Typography variant="body2">
            The constraints don&apos;t fit this structure:
          </Typography>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {result.errors.map((e) => (
              <li key={`${e.path}:${e.message}`}>
                <Typography variant="body2">
                  {placeOf(e.path) ? `${placeOf(e.path)}: ` : ''}
                  {e.message}
                </Typography>
              </li>
            ))}
          </ul>
        </Alert>
      )
    }
    if (!result?.ok || !segments) return null
    return (
      <Stack
        spacing={1}
        data-testid="constraints-file-preview"
      >
        <Typography
          variant="body2"
          color="text.secondary"
        >
          {file
            ? `The fixed and rigid bodies in ${file.name}:`
            : `Using ${initial?.label ?? 'these constraints'}. Select a file to replace them.`}
        </Typography>
        <MDConstraintsSection
          constraints={previewConstraints(result.constraints, segments)}
        />
        {imported && imported.notes.length > 0 && (
          <ListAlert
            severity="info"
            testId="constraints-import-fitted"
            intro="Some selections were fitted to how BilboMD builds this structure:"
            items={imported.notes}
          />
        )}
        {result.warnings.map((w) => (
          <Alert
            key={w}
            severity="warning"
            data-testid="constraints-warning"
          >
            {w}
          </Alert>
        ))}
        {preview && (
          <Accordion
            disableGutters
            variant="outlined"
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">
                const.inp BilboMD will write for CHARMM
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box
                component="pre"
                data-testid="const-inp-preview"
                sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}
              >
                {preview}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </Stack>
    )
  }

  return (
    <Stack
      spacing={1.5}
      data-testid="constraints-file-field"
    >
      {/* Labelled like the form's other file fields */}
      <FormLabel>
        Upload your <b>constraints</b> file
      </FormLabel>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button
          variant="contained"
          component="label"
          disabled={disabled}
          sx={{ minWidth: '110px' }}
        >
          {initial && !file ? 'Replace with a file' : 'Select File'}
          <input
            type="file"
            hidden
            accept={CONSTRAINTS_FILE_ACCEPT}
            data-testid="constraints-file-input"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              // So picking the same file again (after fixing it) reads it again
              e.target.value = ''
              if (picked) pickFile(picked)
            }}
          />
        </Button>
        {file && (
          <Alert
            variant="outlined"
            severity={value ? 'success' : 'info'}
            sx={{ py: 0 }}
          >
            {file.name}
          </Alert>
        )}
        {file && initial && (
          <Button
            size="small"
            disabled={disabled}
            onClick={clearFile}
          >
            Use the original constraints
          </Button>
        )}
      </Stack>
      <Typography
        variant="body2"
        color="text.secondary"
        data-testid="constraints-file-help"
      >
        A const.inp, an OpenMM constraints YAML, or bilbomd_job.json from a
        BilboMD results download, with this job&apos;s fixed and rigid bodies.
        No file yet? Make one with the{' '}
        <Link
          href={jiffy.inp}
          target="_blank"
          rel="noopener"
        >
          Inp Jiffy™
        </Link>
        , or with the{' '}
        <Link
          href={jiffy.pae}
          target="_blank"
          rel="noopener"
        >
          PAE Jiffy™
        </Link>{' '}
        from an AlphaFold model and its PAE file. The file is read here in your
        browser.
      </Typography>
      {status()}
    </Stack>
  )
}

export default ConstraintsFileField
