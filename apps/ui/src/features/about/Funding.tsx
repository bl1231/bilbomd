import React from 'react'
import { Typography, Grid } from '@mui/material'

import useTitle from 'hooks/useTitle'

const Funding: React.FC = () => {
  useTitle('BilboMD: Funding')
  return (
    <Grid
      container
      spacing={2}
    >
      <Typography
        variant="h4"
        gutterBottom
      >
        Funding
      </Typography>

      <Typography variant="body1">
        Development of BilboMD was performed at the Advanced Light Source (ALS)
        at the SIBYLS beamline, a national user facility operated by Lawrence
        Berkeley National Laboratory on behalf of the Department of Energy,
        Office of Basic Energy Sciences, through the Integrated Diffraction
        Analysis Technologies (IDAT) program, supported by DOE Office of
        Biological and Environmental Research. Additional support comes from the
        National Institute of Health project ALS-ENABLE (P30 GM124169). Efforts
        to apply SAXS and crystallography to characterize eukaryotic pathways
        relevant to human cancers are supported in part by the National Cancer
        Institute grant Structural Biology of DNA Repair (SBDR) CA92584. This
        research used resources of the National Energy Research Scientific
        Computing Center (NERSC), a Department of Energy User Facility using
        NERSC award DDR-ERCAP0031203.
      </Typography>

      <Typography
        variant="h4"
        gutterBottom
        sx={{ mt: 2 }}
      >
        Acknowledgments
      </Typography>
      <Typography variant="body1">
        We are grateful for the patience of our early users who were willing to
        work with us to identify bugs and suggest improvements in usability and
        functionality. Their feedback was essential in shaping BilboMD into a
        more robust and accessible tool. We thank our colleagues at the Advanced
        Light Source and other synchrotron facilities for valuable discussions
        on SAXS workflows and integration into experimental pipelines.
        Deployment of BilboMD to NERSC was made possible through support from
        the NERSC SPIN team (with a special thanks to Nicholas Tyler and Gabor
        Torok) and the NESAP program (with help from Johannes Blaschke), whose
        guidance in container orchestration and high-performance computing
        integration greatly facilitated this work. We also acknowledge the
        developers of all the open-source software libraries and packages that
        form the foundation of BilboMD, and the funding agencies whose continued
        support of data-driven structural biology enabled the development of
        this resource.
      </Typography>
    </Grid>
  )
}

export default Funding
