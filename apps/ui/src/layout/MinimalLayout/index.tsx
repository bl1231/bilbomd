import { Outlet } from 'react-router'
import Header from './Header'
import Footer from './Footer'
import { Box } from '@mui/system'
import {
  useLicenseBannerVisible,
  LICENSE_BANNER_HEIGHT
} from 'hooks/useLicenseValid'

const MinimalLayout = () => {
  const bannerVisible = useLicenseBannerVisible()
  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          mb: bannerVisible ? `calc(64px + ${LICENSE_BANNER_HEIGHT}px)` : 8
        }}
      >
        <Header />
      </Box>
      <Outlet />
      <Box sx={{ display: 'flex', mt: 'auto' }}>
        <Footer />
      </Box>
    </Box>
  )
}

export default MinimalLayout
