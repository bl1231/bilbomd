import { useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import {
  importConstraintsFromConstInp,
  importConstraintsFromData,
  MAX_RIGID_BODIES,
  validateConstraintsInput,
  writeConstInp,
  type ConstraintBodyInput,
  type ConstraintMode,
  type ConstraintSegmentInput,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { parse as parseYaml } from 'yaml'
import { readFileText } from './useStructureSegments'
import {
  defaultConstraints,
  describeSegment,
  segmentOf,
  rangeOf,
  segmentFor
} from './constraintsModel'

interface ConstraintsEditorProps {
  mode: ConstraintMode
  /** Segments of the uploaded structure */
  segments: StructureSegment[]
  value: ConstraintsInput
  onChange: (value: ConstraintsInput) => void
  /** CHARMM jobs show the const.inp BilboMD will write */
  engine: 'charmm' | 'openmm'
  disabled?: boolean
}

/**
 * "rigid_bodies[1].segments[0].residues" → "Rigid body 2, segment 1"
 */
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

interface SegmentRowProps {
  mode: ConstraintMode
  segments: StructureSegment[]
  value: ConstraintSegmentInput
  onChange: (value: ConstraintSegmentInput) => void
  onRemove?: () => void
  disabled?: boolean
  label: string
}

const SegmentRow = ({
  mode,
  segments,
  value,
  onChange,
  onRemove,
  disabled,
  label
}: SegmentRowProps) => {
  const target = segmentOf(segments, value)
  const key = target?.segid ?? ''
  const whole = value.residues === undefined
  const setNumber = (field: 'start' | 'stop', text: string) => {
    const base =
      value.residues ?? (target ? rangeOf(target) : { start: 0, stop: 0 })
    onChange({ ...value, residues: { ...base, [field]: Number(text) } })
  }
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
    >
      <TextField
        select
        size="small"
        label={label}
        value={key}
        disabled={disabled}
        sx={{ minWidth: 260 }}
        onChange={(e) => {
          const next = segments.find((s) => s.segid === e.target.value)
          if (next)
            onChange(segmentFor(mode, next, value.residues && rangeOf(next)))
        }}
      >
        {segments.map((s) => (
          <MenuItem
            key={s.segid}
            value={s.segid}
          >
            {describeSegment(mode, s)}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={whole}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? segmentFor(
                      mode,
                      target ??
                        segments.find((s) => s.chain_id === value.chain_id) ??
                        segments[0]!
                    )
                  : {
                      ...value,
                      residues: target ? rangeOf(target) : { start: 0, stop: 0 }
                    }
              )
            }
          />
        }
        label="Whole segment"
      />
      {!whole && (
        <>
          <TextField
            size="small"
            type="number"
            label="From residue"
            value={value.residues?.start ?? ''}
            disabled={disabled}
            onChange={(e) => setNumber('start', e.target.value)}
            sx={{ width: 130 }}
          />
          <TextField
            size="small"
            type="number"
            label="To residue"
            value={value.residues?.stop ?? ''}
            disabled={disabled}
            onChange={(e) => setNumber('stop', e.target.value)}
            sx={{ width: 130 }}
          />
        </>
      )}
      {onRemove && (
        <IconButton
          aria-label={`Remove ${label}`}
          size="small"
          disabled={disabled}
          onClick={onRemove}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  )
}

interface BodyEditorProps {
  title: string
  help: string
  mode: ConstraintMode
  segments: StructureSegment[]
  value: ConstraintBodyInput
  onChange: (value: ConstraintBodyInput) => void
  onRemove?: () => void
  disabled?: boolean
}

const BodyEditor = ({
  title,
  help,
  mode,
  segments,
  value,
  onChange,
  onRemove,
  disabled
}: BodyEditorProps) => (
  <Paper
    variant="outlined"
    sx={{ p: 1.5 }}
  >
    <Stack
      direction="row"
      sx={{ alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Box>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography
          variant="caption"
          color="text.secondary"
        >
          {help}
        </Typography>
      </Box>
      {onRemove && (
        <Button
          size="small"
          color="error"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove body
        </Button>
      )}
    </Stack>
    <Stack
      spacing={1.5}
      sx={{ mt: 1.5 }}
    >
      {value.segments.map((segment, i) => (
        <SegmentRow
          // Rows have no identity of their own; position is what the user edits
          key={i}
          label={`Segment ${i + 1}`}
          mode={mode}
          segments={segments}
          value={segment}
          disabled={disabled}
          onChange={(next) =>
            onChange({
              segments: value.segments.map((s, j) => (j === i ? next : s))
            })
          }
          onRemove={
            value.segments.length > 1
              ? () =>
                  onChange({
                    segments: value.segments.filter((_, j) => j !== i)
                  })
              : undefined
          }
        />
      ))}
      <Box>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={disabled || segments.length === 0}
          onClick={() =>
            onChange({
              segments: [
                ...value.segments,
                segmentFor(mode, segments[0]!, rangeOf(segments[0]!))
              ]
            })
          }
        >
          Add segment
        </Button>
      </Box>
    </Stack>
  </Paper>
)

/**
 * Edits a job's MD constraints against its uploaded structure: one fixed body
 * (held in place) and up to MAX_RIGID_BODIES rigid bodies (each moved as one
 * piece). Checks them with the same validator the server runs, shows the
 * const.inp BilboMD will write for CHARMM jobs, and can start from an old
 * const.inp, read here in the browser (its text is never sent).
 */
export const ConstraintsEditor = ({
  mode,
  segments,
  value,
  onChange,
  engine,
  disabled
}: ConstraintsEditorProps) => {
  const fileInput = useRef<HTMLInputElement>(null)
  const [importText, setImportText] = useState<string | null>(null)
  const [importProblems, setImportProblems] = useState<string[]>([])
  const [importNotes, setImportNotes] = useState<string[]>([])
  const [fixedChoices, setFixedChoices] = useState<ConstraintBodyInput[]>([])

  const result = useMemo(
    () => validateConstraintsInput(value, { mode, segments, engine }),
    [value, mode, segments, engine]
  )
  const preview = useMemo(
    () =>
      result.ok && engine === 'charmm'
        ? writeConstInp(result.constraints)
        : null,
    [result, engine]
  )

  const applyImport = (text: string, fixedBody?: number) => {
    const imported = importConstraintsFromConstInp(text, mode, {
      structure: segments,
      ...(fixedBody !== undefined ? { fixedBody } : {})
    })
    const needsChoice =
      imported.input === null && imported.fixed_choices.length > 1
    setFixedChoices(needsChoice ? imported.fixed_choices : [])
    setImportText(needsChoice ? text : null)
    setImportProblems(
      imported.problems.filter(
        (p) => !p.includes('Choose which is the fixed body')
      )
    )
    setImportNotes(imported.notes)
    if (imported.input) onChange(imported.input)
  }

  // An OpenMM constraints YAML (openmm_const.yml) or constraints JSON; YAML
  // reads JSON too
  const applyDataImport = (text: string) => {
    setFixedChoices([])
    setImportText(null)
    let data: unknown
    try {
      data = parseYaml(text, { maxAliasCount: 0 })
    } catch {
      setImportProblems(['The file could not be read as YAML or JSON'])
      setImportNotes([])
      return
    }
    const imported = importConstraintsFromData(data, mode, {
      structure: segments
    })
    setImportProblems(imported.problems)
    setImportNotes(imported.notes)
    if (imported.input) onChange(imported.input)
  }

  const importFile = async (file: File) => {
    const text = await readFileText(file)
    if (/\.(ya?ml|json)$/i.test(file.name)) applyDataImport(text)
    else applyImport(text)
  }

  const rigid = value.rigid_bodies ?? []
  const setRigid = (bodies: ConstraintBodyInput[]) =>
    onChange({
      fixed_bodies: value.fixed_bodies,
      ...(bodies.length > 0 ? { rigid_bodies: bodies } : {})
    })

  return (
    <Stack
      spacing={2}
      data-testid="constraints-editor"
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center' }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<UploadFileIcon />}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          Start from an existing constraints file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".inp,.yml,.yaml,.json"
          hidden
          data-testid="constraints-import"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) await importFile(file)
          }}
        />
        <Button
          size="small"
          disabled={disabled}
          onClick={() => {
            setImportProblems([])
            setImportNotes([])
            setFixedChoices([])
            onChange(defaultConstraints(mode, segments))
          }}
        >
          Reset
        </Button>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: -1 }}
      >
        A const.inp, an OpenMM constraints YAML, or from a BilboMD results
        download: openmm_const.yml, openmm_config.yaml or bilbomd_job.json.
        Files are read here in your browser.
      </Typography>

      {fixedChoices.length > 1 && importText !== null && (
        <Alert
          severity="warning"
          data-testid="fixed-body-choice"
        >
          <Typography
            variant="body2"
            sx={{ mb: 1 }}
          >
            The file has {fixedChoices.length} &quot;cons fix&quot; commands,
            but CHARMM uses only the last one. Which is the fixed body?
          </Typography>
          <Stack spacing={0.5}>
            {fixedChoices.map((body, i) => (
              <Button
                // The choices come from one file and never change order
                key={i}
                size="small"
                variant="outlined"
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                onClick={() => applyImport(importText, i)}
              >
                {`cons fix #${i + 1}: ${body.segments
                  .map((s) => {
                    const name = s.segid ?? `chain ${s.chain_id}`
                    return s.residues
                      ? `${name} ${s.residues.start}–${s.residues.stop}`
                      : `${name} (whole)`
                  })
                  .join(', ')}`}
              </Button>
            ))}
          </Stack>
        </Alert>
      )}

      {importProblems.length > 0 && (
        <Alert
          severity="info"
          data-testid="const-inp-import-notes"
        >
          <Typography variant="body2">
            Some of the file was not imported:
          </Typography>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {importProblems.map((p) => (
              <li key={p}>
                <Typography variant="body2">{p}</Typography>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {importNotes.length > 0 && (
        <Alert
          severity="info"
          data-testid="constraints-import-fitted"
        >
          <Typography variant="body2">
            Some selections were fitted to how BilboMD builds this structure:
          </Typography>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {importNotes.map((n) => (
              <li key={n}>
                <Typography variant="body2">{n}</Typography>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <BodyEditor
        title="Fixed body"
        help="Held in place during MD, as the reference frame."
        mode={mode}
        segments={segments}
        value={value.fixed_bodies[0] ?? { segments: [] }}
        disabled={disabled}
        onChange={(body) => onChange({ ...value, fixed_bodies: [body] })}
      />

      {rigid.map((body, i) => (
        <BodyEditor
          // Bodies have no identity of their own; position is what the user edits
          key={i}
          title={`Rigid body ${i + 1}`}
          help="Moves as one piece; the residues between bodies stay flexible."
          mode={mode}
          segments={segments}
          value={body}
          disabled={disabled}
          onChange={(next) =>
            setRigid(rigid.map((b, j) => (j === i ? next : b)))
          }
          onRemove={() => setRigid(rigid.filter((_, j) => j !== i))}
        />
      ))}

      <Box>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={
            disabled ||
            rigid.length >= MAX_RIGID_BODIES ||
            segments.length === 0
          }
          onClick={() =>
            setRigid([
              ...rigid,
              {
                segments: [
                  segmentFor(mode, segments[0]!, rangeOf(segments[0]!))
                ]
              }
            ])
          }
        >
          Add rigid body
        </Button>
      </Box>

      {!result.ok && (
        <Alert
          severity="error"
          data-testid="constraints-errors"
        >
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
      )}
      {result.ok &&
        result.warnings.map((w) => (
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
