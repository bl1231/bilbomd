import { Outlet } from 'react-router'
import Header from './Header'
import Footer from './Footer'
import { Box } from '@mui/system'
import LicenseBanner from 'components/LicenseBanner'

const MinimalLayout = () => {
  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ display: 'flex', mb: 8 }}>
        <Header />
      </Box>
      <Box sx={{ px: 3 }}>
        <LicenseBanner />
      </Box>
      <Outlet />
      <Box sx={{ display: 'flex', mt: 'auto' }}>
        <Footer />
      </Box>
    </Box>
  )
}

export default MinimalLayout
