import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
  Link
} from '@mui/material'
import Grid from '@mui/material/Grid'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

const NewSANSJobFormInstructions = () => (
  <Grid size={{ xs: 12 }}>
    <Accordion>
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
          Instructions
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          <Typography sx={{ m: 1 }}>
            <b>BilboMD SANS</b> is a data analysis pipeline that uses a minimal
            MD step with CHARMM or OpenMM to generate thousands of molecular
            models. Theoretical SANS scattering curves are then calculated from
            these models using{' '}
            <Link
              href="https://team.inria.fr/nano-d/software/pepsi-sans/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <b>Pepsi-SANS</b>
            </Link>
            . The models are then analyzed using a genetic algorithm developed
            by Alan Hicks called{' '}
            <Link
              href="https://github.com/achicks15/GA-SAS"
              target="_blank"
              rel="noopener noreferrer"
            >
              <b>GA-SAS</b>
            </Link>{' '}
            to determine the best multi-state models to explain your Small Angle
            Neutron Scattering (SANS) data. This pipeline is still under
            development and feedback is welcome.
          </Typography>
        </Box>
      </AccordionDetails>
    </Accordion>
  </Grid>
)

export default NewSANSJobFormInstructions
