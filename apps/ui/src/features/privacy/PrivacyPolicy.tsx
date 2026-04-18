import React from 'react'
import { Box, Typography, Link } from '@mui/material'
import { grey } from '@mui/material/colors'

export default function PrivacyPolicy() {
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
            <Typography variant="h4">Privacy and Cookie Policy</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <Typography variant="body1">
              BilboMD is a scientific web service provided for academic and
              research use. We collect and process minimal user data necessary
              to operate the service and to support computational job
              submissions.
            </Typography>

            <Typography
              variant="h5"
              gutterBottom
              sx={{ mt: 2 }}
            >
              Cookies
            </Typography>
            <Typography variant="body1">
              This site uses essential cookies to maintain session state and
              enable secure access to submitted results. These cookies do not
              contain personal information and are not used for advertising or
              tracking.
            </Typography>
            <Typography variant="body1">
              A cookie consent notice is displayed on your first visit. By
              continuing to use the site, you agree to the use of functional
              cookies described here.
            </Typography>

            <Typography
              variant="h5"
              gutterBottom
              sx={{ mt: 2 }}
            >
              Personal Data
            </Typography>
            <Typography variant="body1">
              Users may optionally register with an email address or via an
              institutional OAuth provider (such as ORCID) to access additional
              features. These identifiers are used solely for authentication and
              are not shared with third parties.
            </Typography>
            <Typography variant="body1">
              Anonymous (unauthenticated) use of BilboMD is available for
              submitting public jobs without providing personal information.
            </Typography>

            <Typography
              variant="h5"
              gutterBottom
              sx={{ mt: 2 }}
            >
              Data Privacy
            </Typography>
            <Typography variant="body1">
              Uploaded files and computational results are stored on secure
              servers and are accessible only to the submitting user (or via a
              public link when explicitly created for anonymous jobs). All data
              are automatically deleted after a defined retention period.
            </Typography>

            <Typography
              variant="h5"
              gutterBottom
              sx={{ mt: 2 }}
            >
              Contact
            </Typography>
            <Typography variant="body1">
              Questions about this policy or data handling may be directed to
              the BilboMD development team at{' '}
              <Link href="mailto:bilbomd@lbl.gov">bilbomd-support</Link>.
            </Typography>

            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 4 }}
            >
              Last updated: 1/23/2025
            </Typography>
          </Box>
        </Box>
      </Box>
    </React.Fragment>
  )
}
