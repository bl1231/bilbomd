import { Alert } from '@mui/material'
import { closeBodiesMessage } from '@bilbomd/bilbomd-types'
import type { RigidBody } from 'types/interfaces'
import { jiffyConstraints } from './jiffyConstraints'

/**
 * A warning, not an error, when two bodies on a chain have fewer than
 * MIN_FLEX_GAP flexible residues between them (#1101).
 */
const GapWarning = ({ rigidBodies }: { rigidBodies: RigidBody[] }) => {
  const message = closeBodiesMessage(jiffyConstraints(rigidBodies))
  if (!message) return null
  return (
    <Alert
      severity="warning"
      sx={{ m: 1 }}
      data-testid="jiffy-gap-warning"
    >
      {message}
    </Alert>
  )
}

export default GapWarning
