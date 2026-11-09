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

const NewBioEmuJobFormInstructions = () => {
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
            <b>BilboMD BioEmu2</b> builds conformational ensembles from your
            sequences and SAXS data without molecular dynamics. It runs{' '}
            <Link
              href="https://github.com/microsoft/bioemu2"
              target="_blank"
              rel="noopener noreferrer"
            >
              BioEmu2
            </Link>{' '}
            (Microsoft Research), a generative model that samples independent
            all-atom structures, and steers every sample towards the radius of
            gyration (Rg) targets that <b>BilboMD</b> derives from your data.
            FoXS and MultiFoXS then find the ensembles that best fit your SAXS
            curve, and the members of those ensembles are polished with a short,
            restrained OpenMM energy minimization.
          </Typography>
          <Typography sx={{ m: 1 }}>Required inputs:</Typography>
          <ul>
            <li>
              <Typography>
                The sequence and number of copies of each chain (Protein or
                DNA). A homodimer is one entity with 2 copies.
              </Typography>
            </li>
            <li>
              <Typography>
                A <b>*.dat</b> file (a 3-column experimental SAXS data file)
              </Typography>
            </li>
          </ul>
          <Alert
            severity="warning"
            sx={{ my: 2 }}
          >
            <AlertTitle>Sequence only</AlertTitle>
            <Typography>
              BioEmu2 works from your sequences and their multiple sequence
              alignment alone. There is no way to give it a starting model, fix
              a domain arrangement, or force an interface between chains. If you
              need that control, use <b>BilboMD Auto</b> or{' '}
              <b>BilboMD Classic</b> with your own model.
            </Typography>
          </Alert>
          <Alert
            severity="info"
            sx={{ my: 2 }}
          >
            <AlertTitle>Testing</AlertTitle>
            <Typography>
              This pipeline is being validated and is open to administrators
              only. Systems are limited in size (residues plus nucleotides,
              counting copies), because sampling time and GPU memory grow with
              the square of the system size. RNA is not supported yet.
            </Typography>
          </Alert>
          <Typography sx={{ m: 1 }}>Sequence character sets:</Typography>
          <ul>
            <li>
              <Typography>
                <b>Protein:</b> A, C, D, E, F, G, H, I, K, L, M, N, P, Q, R, S,
                T, V, W, Y
              </Typography>
            </li>
            <li>
              <Typography>
                <b>DNA:</b> A, C, G, T
              </Typography>
            </li>
          </ul>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

export default NewBioEmuJobFormInstructions
