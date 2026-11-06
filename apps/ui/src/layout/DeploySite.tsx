import { Box, Typography } from '@mui/material'
import nerscLogo from 'assets/nersc-logo.png'
// From https://berkelium.scs.lbl.gov (its site icon), LBNL Science IT
import berkeliumLogo from 'assets/berkelium-logo.png'

interface DeploySiteProps {
  // config.deploySite (BILBOMD_DEPLOY_SITE): nersc, berkelium, local, bl1231
  deploySite: string
}

const LOGO_HEIGHT = '30px'
// The Berkelium icon is round and solid, so it reads larger than the NERSC wordmark
const BERKELIUM_ICON_SIZE = '24px'

// Where this BilboMD is deployed, shown next to the title in the header
const DeploySite = ({ deploySite }: DeploySiteProps) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
    {deploySite === 'nersc' && (
      <img
        src={nerscLogo}
        alt="NERSC Logo"
        style={{ height: LOGO_HEIGHT }}
      />
    )}
    {deploySite === 'berkelium' && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1.5 }}>
        <img
          src={berkeliumLogo}
          alt="Berkelium Logo"
          style={{ height: BERKELIUM_ICON_SIZE, width: BERKELIUM_ICON_SIZE }}
        />
        <Typography
          variant="h5"
          component="span"
        >
          BERKELIUM
        </Typography>
      </Box>
    )}
    {deploySite === 'local' && (
      <Typography
        variant="h5"
        component="span"
        sx={{ ml: 1 }}
      >
        LOCAL
      </Typography>
    )}
    {deploySite === 'bl1231' && (
      <Typography
        variant="h5"
        component="span"
        sx={{ ml: 1, pb: 0 }}
      >
        BL12.3.1
      </Typography>
    )}
  </Box>
)

export default DeploySite
