import React from 'react'
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { ChainMolType, MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import {
  BODY_COLORS,
  BODY_LABELS,
  FLEXIBLE_COLOR,
  buildChainTracks,
  type Body,
  type BodyType,
  type ChainTrack
} from './constraintTracks'

const rangeLabel = (chainId: string, start: number, stop: number) =>
  `${chainId} ${start}–${stop}`

const TrackBlock = ({
  track,
  start,
  stop,
  type,
  color,
  title
}: {
  track: ChainTrack
  start: number
  stop: number
  type: string
  color: string
  title: string
}) => (
  <Tooltip
    title={title}
    arrow
  >
    <Box
      data-testid="constraint-track-segment"
      data-type={type}
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${((start - 1) / track.length) * 100}%`,
        width: `${((stop - start + 1) / track.length) * 100}%`,
        // Keep tiny segments visible on long chains
        minWidth: 3,
        backgroundColor: color
      }}
    />
  </Tooltip>
)

const ChainTrackRow = ({ track }: { track: ChainTrack }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
    <Typography
      variant="body2"
      sx={{ width: 64, flexShrink: 0, fontWeight: 500, lineHeight: '16px' }}
    >
      Chain {track.chainId}
    </Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box
        data-testid={`constraint-track-${track.chainId}`}
        sx={{
          position: 'relative',
          height: 16,
          borderRadius: 1,
          backgroundColor: 'action.hover',
          overflow: 'hidden'
        }}
      >
        {track.flexible.map(({ start, stop }) => (
          <TrackBlock
            key={`flexible-${start}`}
            track={track}
            start={start}
            stop={stop}
            type="flexible"
            color={FLEXIBLE_COLOR}
            title={`Flexible · ${rangeLabel(track.chainId, start, stop)}`}
          />
        ))}
        {track.segments.map((seg) => (
          <TrackBlock
            key={`${seg.type}-${seg.bodyName}-${seg.start}`}
            track={track}
            start={seg.start}
            stop={seg.stop}
            type={seg.type}
            color={BODY_COLORS[seg.type]}
            title={`${BODY_LABELS[seg.type]} · ${seg.bodyName} · ${rangeLabel(track.chainId, seg.start, seg.stop)}`}
          />
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'text.secondary'
        }}
      >
        <Typography variant="caption">1</Typography>
        <Typography variant="caption">{track.length}</Typography>
      </Box>
    </Box>
  </Box>
)

type LineRange = { chainId: string; start: number; stop: number }
type MolTypes = Partial<Record<string, ChainMolType>>

const MOL_TYPE_LABELS: Record<ChainMolType, string> = {
  PRO: 'PRO',
  DNA: 'DNA',
  RNA: 'RNA',
  CAR: 'CARB'
}
const MOL_TYPE_NAMES: Record<ChainMolType, string> = {
  PRO: 'Protein',
  DNA: 'DNA',
  RNA: 'RNA',
  CAR: 'Carbohydrate'
}

const MolTypeChip = ({ type }: { type: ChainMolType }) => (
  <Tooltip
    title={MOL_TYPE_NAMES[type]}
    arrow
  >
    <Chip
      size="small"
      variant="outlined"
      label={MOL_TYPE_LABELS[type]}
      data-testid="mol-type-chip"
      sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}
    />
  </Tooltip>
)

const ConstraintLine = ({
  tag,
  color,
  tagTextColor = '#fff',
  name,
  ranges,
  molTypes
}: {
  tag: string
  color: string
  tagTextColor?: string
  name?: string
  ranges: LineRange[]
  molTypes: MolTypes
}) => (
  <Box
    sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}
  >
    <Chip
      size="small"
      label={tag}
      sx={{
        width: 64,
        color: tagTextColor,
        fontWeight: 600,
        backgroundColor: color
      }}
    />
    {name && (
      <Typography
        variant="body2"
        sx={{ fontWeight: 600 }}
      >
        {name}
      </Typography>
    )}
    {ranges.map(({ chainId, start, stop }, i) => {
      const molType = molTypes[chainId]
      const prev = ranges[i - 1]
      // One type chip per group of consecutive ranges with the same molecule type
      const startsGroup = !prev || molTypes[prev.chainId] !== molType
      return (
        <React.Fragment key={`${chainId}-${start}`}>
          {molType && startsGroup && <MolTypeChip type={molType} />}
          <Chip
            size="small"
            variant="outlined"
            label={rangeLabel(chainId, start, stop)}
            sx={{
              fontVariantNumeric: 'tabular-nums',
              borderColor: color,
              backgroundColor: alpha(color, 0.12)
            }}
          />
        </React.Fragment>
      )
    })}
  </Box>
)

const BodyLine = ({
  body,
  type,
  molTypes
}: {
  body: Body
  type: BodyType
  molTypes: MolTypes
}) => (
  <ConstraintLine
    molTypes={molTypes}
    tag={BODY_LABELS[type]}
    color={BODY_COLORS[type]}
    name={body.name}
    ranges={(body.segments ?? []).map(({ chain_id, residues }) => ({
      chainId: chain_id,
      start: residues.start,
      stop: residues.stop
    }))}
  />
)

interface MDConstraintsRendererProps {
  constraints: MDConstraintsDTO
}

export const MDConstraintsRenderer: React.FC<MDConstraintsRendererProps> = ({
  constraints
}) => {
  const {
    fixed_bodies = [],
    rigid_bodies = [],
    chain_mol_types = []
  } = constraints
  const molTypes: MolTypes = Object.fromEntries(
    chain_mol_types.map(({ chain_id, mol_type }) => [chain_id, mol_type])
  )

  if (fixed_bodies.length === 0 && rigid_bodies.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
      >
        No constraints found.
      </Typography>
    )
  }

  const tracks = buildChainTracks(constraints)
  const flexible = tracks.flatMap((track) =>
    track.flexible.map((range) => ({ chainId: track.chainId, ...range }))
  )

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2
      }}
    >
      {tracks.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {tracks.map((track) => (
            <ChainTrackRow
              key={track.chainId}
              track={track}
            />
          ))}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {fixed_bodies.map((body) => (
          <BodyLine
            key={`fixed-${body.name}`}
            body={body}
            type="fixed"
            molTypes={molTypes}
          />
        ))}
        {rigid_bodies.map((body) => (
          <BodyLine
            key={`rigid-${body.name}`}
            body={body}
            type="rigid"
            molTypes={molTypes}
          />
        ))}
        {flexible.length > 0 && (
          <ConstraintLine
            tag="Flexible"
            color={FLEXIBLE_COLOR}
            tagTextColor="rgba(0, 0, 0, 0.87)"
            ranges={flexible}
            molTypes={molTypes}
          />
        )}
      </Box>
    </Box>
  )
}
