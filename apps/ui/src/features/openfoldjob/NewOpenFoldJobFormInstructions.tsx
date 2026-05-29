import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Link,
  Typography
} from '@mui/material'
import { useState } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

const NewOpenFoldJobFormInstructions = () => {
  const [expanded, setExpanded] = useState(false)

  const handleChange = () => {
    setExpanded(!expanded)
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={handleChange}
    >
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
          <span style={{ color: '#ffeb3b', textTransform: 'uppercase' }}>
            {expanded ? 'HIDE' : 'SHOW'}{' '}
          </span>
          Instructions
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          <Typography sx={{ m: 1 }}>
            <b>BilboMD OF3</b> takes your sequence information for Proteins,
            DNA, and RNA chains and runs{' '}
            <Link
              href="https://github.com/aqlaboratory/openfold-3"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenFold3
            </Link>{' '}
            to predict the 3D structure. <b>BilboMD OF3</b> then analyzes the
            Predicted Aligned Error (PAE) from OpenFold3 along with the top
            scoring model to automagically generate OpenMM-compatible input
            files to feed into the standard <b>BilboMD</b> pipeline.
          </Typography>
          <Typography sx={{ m: 1 }}>Required inputs:</Typography>
          <ul>
            <li>
              <Typography>
                Define the sequence and number of copies of each chain (Protein,
                DNA, or RNA) in your macromolecule or complex. OpenFold3 can
                process Protein, DNA, and RNA chains in a single prediction run.
              </Typography>
            </li>
            <li>
              <Typography>
                A <b>*.dat</b> file (A 3-column experimental SAXS data file)
              </Typography>
            </li>
          </ul>
          <Alert
            severity="info"
            sx={{ my: 2 }}
          >
            <AlertTitle>About OpenFold3</AlertTitle>
            <Typography>
              <b>BilboMD OF3</b> uses{' '}
              <Link
                href="https://github.com/aqlaboratory/openfold-3"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenFold3
              </Link>
              , an open-source reimplementation of AlphaFold3. Unlike{' '}
              <b>BilboMD AF</b> which only supports protein chains,{' '}
              <b>BilboMD OF3</b> supports Protein, DNA, and RNA chains
              simultaneously, making it ideal for modeling protein-nucleic acid
              complexes.
            </Typography>
          </Alert>
          <Typography sx={{ m: 1 }}>Sequence character sets:</Typography>
          <ul>
            <li>
              <Typography>
                <b>Protein:</b> A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R,
                S, T, V, W, Y
              </Typography>
            </li>
            <li>
              <Typography>
                <b>DNA:</b> A, C, G, T
              </Typography>
            </li>
            <li>
              <Typography>
                <b>RNA:</b> A, C, G, U
              </Typography>
            </li>
          </ul>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

export default NewOpenFoldJobFormInstructions
