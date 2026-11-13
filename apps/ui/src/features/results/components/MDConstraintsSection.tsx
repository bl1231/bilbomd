import { useId, useState } from 'react'
import { Box, Button, Collapse } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import ConstraintSchematic from 'features/constraintSchematic/ConstraintSchematic'
import { MDConstraintsRenderer } from './MDConstraintsRenderer'

const hasBodies = (constraints: MDConstraintsDTO) =>
  (constraints.fixed_bodies?.length ?? 0) +
    (constraints.rigid_bodies?.length ?? 0) >
  0

/**
 * The job page's MD Constraints: the compact chain track and body list, with
 * the bead-and-spring schematic one click away. The schematic only mounts
 * while it is open, so a closed section runs no simulation.
 */
export const MDConstraintsSection = ({
  constraints
}: {
  constraints: MDConstraintsDTO
}) => {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <MDConstraintsRenderer constraints={constraints} />
      {hasBodies(constraints) && (
        <>
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
              endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {open ? 'Hide schematic' : 'Show schematic'}
            </Button>
          </Box>
          <Collapse
            in={open}
            unmountOnExit
          >
            <Box
              id={panelId}
              sx={{ pt: 1 }}
              data-testid="md-constraints-schematic"
            >
              <ConstraintSchematic constraints={constraints} />
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  )
}
