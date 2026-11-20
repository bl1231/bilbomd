import React from 'react'
import { Box, Typography } from '@mui/material'
import useTitle from 'hooks/useTitle'

const Copyright: React.FC = () => {
  useTitle('BilboMD: Copyright')
  return (
    <React.Fragment>
      <Box
        sx={{
          p: 0,
          border: 1,
          borderRadius: 1,
          borderColor: 'panel.border',
          backgroundColor: 'panel.background',
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
              backgroundColor: 'panel.header',
              p: 1,
              m: 0,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              borderBottom: 1,
              borderColor: 'panel.border'
            }}
          >
            <Typography variant="h4">Copyright</Typography>
          </Box>

          <Typography
            variant="body1"
            gutterBottom
            sx={{ p: 2, whiteSpace: 'pre-line' }}
          >
            BilboMD Copyright © 2025, The Regents of the University of
            California, through Lawrence Berkeley National Laboratory (“Berkeley
            Lab”) subject to receipt of any required approvals from the U.S.
            Dept. of Energy. All rights reserved.
          </Typography>
        </Box>
      </Box>
    </React.Fragment>
  )
}

export default Copyright
