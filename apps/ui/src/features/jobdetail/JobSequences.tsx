import { useState } from 'react'
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useSnackbar } from 'notistack'
import type { SequenceEntityDTO } from '@bilbomd/bilbomd-types'
import {
  lengthLabel,
  sequenceBlocks,
  toFasta,
  totalSize
} from './sequenceFormat'

// Sequences longer than this start collapsed to their first PREVIEW_LENGTH
const COLLAPSE_ABOVE = 120
const PREVIEW_LENGTH = 60

// Announce the copy only once the clipboard has accepted it: the write is
// rejected when the browser denies access, and `navigator.clipboard` is
// missing altogether outside a secure context.
const useCopy = () => {
  const { enqueueSnackbar } = useSnackbar()
  return (text: string, what: string) => {
    const write = async () => {
      await navigator.clipboard.writeText(text)
    }
    write().then(
      () =>
        enqueueSnackbar(`${what} copied to clipboard!`, { variant: 'default' }),
      () =>
        enqueueSnackbar(`Could not copy the ${what} to the clipboard`, {
          variant: 'error'
        })
    )
  }
}

// Blocks of ten with the end position above each, so the layout wraps at any
// width. The position labels are not selectable: dragging over the sequence
// copies residues only.
const SequenceBlocks = ({ sequence }: { sequence: string }) => (
  <Box
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      columnGap: 1,
      rowGap: 0.5,
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      lineHeight: 1.2
    }}
  >
    {sequenceBlocks(sequence).map(({ end, text }) => (
      <Box
        key={end}
        component="span"
        sx={{ display: 'inline-flex', flexDirection: 'column' }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            textAlign: 'right',
            fontSize: '0.65rem',
            color: 'text.secondary',
            userSelect: 'none'
          }}
        >
          {end}
        </Box>
        <span>{text}</span>
      </Box>
    ))}
  </Box>
)

const EntitySequence = ({ entity }: { entity: SequenceEntityDTO }) => {
  const copy = useCopy()
  const { name, sequence, type, copies } = entity
  const collapsible = sequence.length > COLLAPSE_ABOVE
  const [expanded, setExpanded] = useState(false)
  const shown =
    collapsible && !expanded ? sequence.slice(0, PREVIEW_LENGTH) : sequence

  return (
    <Box
      data-testid="sequence-entity"
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1,
        py: 0.5
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 1
        }}
      >
        <Typography sx={{ fontWeight: 'bold', overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexGrow: 1 }}
        >
          {type} · {copies} {copies === 1 ? 'copy' : 'copies'} ·{' '}
          {lengthLabel(entity)}
        </Typography>
        <Tooltip title={`Copy the ${name} sequence`}>
          <IconButton
            size="small"
            aria-label={`Copy the ${name} sequence`}
            onClick={() => copy(sequence, `${name} sequence`)}
          >
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </Box>
      <SequenceBlocks sequence={shown} />
      {collapsible && (
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          sx={{ textTransform: 'none', px: 0, minWidth: 0 }}
        >
          {expanded
            ? 'Show less'
            : `Show all ${sequence.length.toLocaleString('en-US')}`}
        </Button>
      )}
    </Box>
  )
}

// The sequences an AlphaFold, OpenFold3 or BioEmu2 job was submitted with
const JobSequences = ({ entities }: { entities: SequenceEntityDTO[] }) => {
  const copy = useCopy()
  if (entities.length === 0) return null

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.5
        }}
      >
        <Typography sx={{ fontWeight: 'bold' }}>Sequences:</Typography>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={() => copy(toFasta(entities), 'FASTA')}
          sx={{ textTransform: 'none' }}
        >
          Copy as FASTA
        </Button>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {entities.map((entity, i) => (
          <EntitySequence
            key={`${entity.name}-${i}`}
            entity={entity}
          />
        ))}
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5, textAlign: 'right' }}
      >
        Total size: {totalSize(entities).toLocaleString('en-US')} residues and
        nucleotides, counting copies
      </Typography>
    </Box>
  )
}

export default JobSequences
