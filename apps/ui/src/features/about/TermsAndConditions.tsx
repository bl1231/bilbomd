import React from 'react'
import { Box, Typography, Link } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import useTitle from 'hooks/useTitle'
import { grey } from '@mui/material/colors'

const TermsAndConditions: React.FC = () => {
  useTitle('BilboMD: Terms & Conditions')
  return (
    <React.Fragment>
      <Box
        sx={{
          p: 0,
          border: 1,
          borderRadius: 1,
          borderColor: grey[500],
          backgroundColor: grey[200],
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 'calc(100vw - 260px)',
          overflow: 'hidden'
        }}
      >
        <Box>
          <Box
            sx={{
              backgroundColor: grey[500],
              p: 1,
              m: 0,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              borderBottom: 1,
              borderColor: grey[500]
            }}
          >
            <Typography variant="h4">Terms and Conditions</Typography>
          </Box>

          <Typography
            variant="body1"
            gutterBottom
            sx={{ p: 2, whiteSpace: 'pre-line' }}
          >
            Your use of the{' '}
            <Link
              href="https://bilbomd.bl1231.als.lbl.gov"
              target="_blank"
              rel="noopener noreferrer"
            >
              BilboMD web application (app)
            </Link>{' '}
            and application programming interface (API) is subject to the
            following terms and conditions: the BilboMD web app and API are
            operated by Lawrence Berkeley National Laboratory (LBNL), a U.S.
            Department of Energy (DOE) national laboratory managed and operated
            by the University of California (&quot;LBNL&quot; and &quot;Berkeley
            Lab&quot;) engaged in fundamental, unclassified research in the
            public interest. By using the web app and API, you agree to abide by
            the{' '}
            <RouterLink to="/privacy">BilboMD Data Privacy Terms</RouterLink>{' '}
            and the{' '}
            <Link
              href="https://www.lbl.gov/terms-and-conditions/"
              target="_blank"
              rel="noopener noreferrer"
            >
              LBNL Terms and Conditions
            </Link>{' '}
            regarding privacy, security, copyright, disclaimers, and
            accessibility information , this Use Agreement, and the terms
            described herein. You also acknowledge that the data in the BilboMD
            web app and API is subject to error and may not be accurate enough
            for your application. You agree not to hold the developers,
            contributors, hosts of the BilboMD web app and API, the Regents of
            the University of California, and the U.S. DOE liable for any
            inaccuracies in the data, or consequences thereof, or for any claims
            brought by any third party regarding their data contributions.
          </Typography>
        </Box>
      </Box>
    </React.Fragment>
  )
}

export default TermsAndConditions
