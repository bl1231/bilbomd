// src/features/privacy/PrivacyPolicy.tsx
import { Box, Typography, Link } from '@mui/material'

export default function PrivacyPolicy() {
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography
        variant="h4"
        gutterBottom
      >
        Privacy and Cookie Policy
      </Typography>

      <Typography
        variant="body1"
        paragraph
      >
        BilboMD is a scientific web service provided for academic and research
        use. We collect and process minimal user data necessary to operate the
        service and to support computational job submissions.
      </Typography>

      <Typography
        variant="h6"
        gutterBottom
      >
        Cookies
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        This site uses essential cookies to maintain session state and enable
        secure access to submitted results. These cookies do not contain
        personal information and are not used for advertising or tracking.
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        A cookie consent notice is displayed on your first visit. By continuing
        to use the site, you agree to the use of functional cookies described
        here.
      </Typography>

      <Typography
        variant="h6"
        gutterBottom
      >
        Personal Data
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        Users may optionally register with an email address or via an
        institutional OAuth provider (such as ORCID) to access additional
        features. These identifiers are used solely for authentication and are
        not shared with third parties.
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        Anonymous (unauthenticated) use of BilboMD is available for submitting
        public jobs without providing personal information.
      </Typography>

      <Typography
        variant="h6"
        gutterBottom
      >
        Data Privacy
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        Uploaded files and computational results are stored on secure servers
        and are accessible only to the submitting user (or via a public link
        when explicitly created for anonymous jobs). All data are automatically
        deleted after a defined retention period.
      </Typography>

      <Typography
        variant="h6"
        gutterBottom
      >
        Contact
      </Typography>
      <Typography
        variant="body1"
        paragraph
      >
        Questions about this policy or data handling may be directed to the
        BilboMD development team at{' '}
        <Link href="mailto:bilbomd-support@lbl.gov">
          bilbomd-support@lbl.gov
        </Link>
        .
      </Typography>

      <Typography
        variant="caption"
        display="block"
        sx={{ mt: 4 }}
      >
        Last updated: {new Date().toLocaleDateString()}
      </Typography>
    </Box>
  )
}
