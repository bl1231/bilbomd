import React from 'react'
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import {
  BODY_COLORS,
  BODY_LABELS,
  buildChainTracks,
  type Body,
  type BodyType,
  type ChainTrack
} from './constraintTracks'

const rangeLabel = (chainId: string, start: number, stop: number) =>
  `${chainId} ${start}–${stop}`

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
        {track.segments.map((seg) => (
          <Tooltip
            key={`${seg.type}-${seg.bodyName}-${seg.start}`}
            title={`${BODY_LABELS[seg.type]} · ${seg.bodyName} · ${rangeLabel(track.chainId, seg.start, seg.stop)}`}
            arrow
          >
            <Box
              data-testid="constraint-track-segment"
              data-type={seg.type}
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${((seg.start - 1) / track.length) * 100}%`,
                width: `${((seg.stop - seg.start + 1) / track.length) * 100}%`,
                // Keep tiny segments visible on long chains
                minWidth: 3,
                backgroundColor: BODY_COLORS[seg.type]
              }}
            />
          </Tooltip>
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

const BodyLine = ({ body, type }: { body: Body; type: BodyType }) => (
  <Box
    sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}
  >
    <Chip
      size="small"
      label={BODY_LABELS[type]}
      sx={{
        width: 56,
        color: '#fff',
        fontWeight: 600,
        backgroundColor: BODY_COLORS[type]
      }}
    />
    <Typography
      variant="body2"
      sx={{ fontWeight: 600 }}
    >
      {body.name}
    </Typography>
    {body.segments?.map(({ chain_id, residues }) => (
      <Chip
        key={`${chain_id}-${residues.start}`}
        size="small"
        variant="outlined"
        label={rangeLabel(chain_id, residues.start, residues.stop)}
        sx={{
          fontVariantNumeric: 'tabular-nums',
          borderColor: BODY_COLORS[type],
          backgroundColor: alpha(BODY_COLORS[type], 0.08)
        }}
      />
    ))}
  </Box>
)

interface MDConstraintsRendererProps {
  constraints: MDConstraintsDTO
}

export const MDConstraintsRenderer: React.FC<MDConstraintsRendererProps> = ({
  constraints
}) => {
  const { fixed_bodies = [], rigid_bodies = [] } = constraints

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
          />
        ))}
        {rigid_bodies.map((body) => (
          <BodyLine
            key={`rigid-${body.name}`}
            body={body}
            type="rigid"
          />
        ))}
      </Box>
    </Box>
  )
}
