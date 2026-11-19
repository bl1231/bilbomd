import React from 'react'
import { Box } from '@mui/material'
import useTitle from 'hooks/useTitle'
// import ConfigPanel from './ConfigPanel'
import QueueOverviewPanel from './QueueOverviewPanel'
import AnalyticsDashboard from '../analytics/AnalyticsDashboard'

const AdminPanel = () => {
  useTitle('BilboMD: Admin Panel')

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
          mb: 2,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 'calc(100vw - 260px)',
          overflow: 'hidden'
        }}
      >
        <Box>
          <QueueOverviewPanel />
        </Box>
      </Box>

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
          <AnalyticsDashboard />
        </Box>
      </Box>
    </React.Fragment>
  )
}

export default AdminPanel
