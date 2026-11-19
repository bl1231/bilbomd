import { ReactNode } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

interface InstructionsAccordionProps {
  children: ReactNode
  title?: string
}

/**
 * A Jiffy's instructions, under a header like the page's other section
 * headers. Open to start with, so new users see how it works; one click
 * folds it away.
 */
const InstructionsAccordion = ({
  children,
  title = 'Instructions'
}: InstructionsAccordionProps) => (
  <Accordion defaultExpanded>
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
      sx={{
        backgroundColor: '#888',
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        pl: 1
      }}
    >
      <Typography
        sx={{
          textTransform: 'uppercase',
          fontSize: '0.875rem',
          fontWeight: 400,
          color: '#fff',
          letterSpacing: '1px'
        }}
      >
        {title}
      </Typography>
    </AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </Accordion>
)

export default InstructionsAccordion
