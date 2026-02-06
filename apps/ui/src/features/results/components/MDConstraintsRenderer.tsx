import React from 'react'
import { Box, Typography, Chip } from '@mui/material'
import type {
  IMDConstraints,
  IFixedBody,
  IRigidBody,
  ISegment
} from '@bilbomd/mongodb-schema'

interface MDConstraintsRendererProps {
  constraints: IMDConstraints
}

export const MDConstraintsRenderer: React.FC<MDConstraintsRendererProps> = ({
  constraints
}) => {
  const { fixed_bodies = [], rigid_bodies = [] } = constraints

  type BodyType = 'fixed' | 'rigid'
  const renderBody = (body: IFixedBody | IRigidBody, type: BodyType) => (
    <Box
      key={body.name}
      sx={{
        mb: 2,
        p: 1,
        border: 1,
        borderColor: 'grey.300',
        borderRadius: 2,
        backgroundColor: 'grey.100'
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 600,
          color: type === 'fixed' ? '#2f54eb' : '#fa8c16',
          mb: 1
        }}
      >
        {body.name}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {body.segments?.map((segment: ISegment) => (
          <Box
            key={segment.chain_id + segment.residues.start}
            sx={{
              p: 1,
              border: 1,
              borderColor: 'grey.300',
              borderRadius: 1,
              backgroundColor: 'background.paper',
              minWidth: 180
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, mb: 0.5 }}
            >
              Chain: {segment.chain_id}
            </Typography>
            <Chip
              label={`Residues: ${segment.residues?.start} - ${segment.residues?.stop}`}
              variant="outlined"
              sx={{
                fontSize: '0.85rem',
                mb: 0.5,
                color: type === 'fixed' ? '#2f54eb' : '#fa8c16'
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )

  return (
    <Box sx={{ width: '75%' }}>
      <Box
        sx={{
          backgroundColor: 'background.paper',
          border: 1,
          borderColor: 'grey.300',
          borderRadius: 2,
          p: 2,
          mb: 1,
          boxShadow: 0
        }}
      >
        {fixed_bodies.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, mb: 1 }}
            >
              Fixed Bodies
            </Typography>
            {fixed_bodies.map((body) => renderBody(body, 'fixed'))}
          </Box>
        )}
        {rigid_bodies.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, mb: 1 }}
            >
              Rigid Bodies
            </Typography>
            {rigid_bodies.map((body) => renderBody(body, 'rigid'))}
          </Box>
        )}
        {fixed_bodies.length === 0 && rigid_bodies.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            No constraints found.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
