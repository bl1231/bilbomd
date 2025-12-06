import useAuth from 'hooks/useAuth'
import useTitle from 'hooks/useTitle'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import {
  Alert,
  Button,
  Typography,
  Link,
  Paper,
  List,
  ListItem
} from '@mui/material'
import Grid from '@mui/material/Grid'
import NerscSystemStatuses from 'features/nersc/SystemStatuses'
import { Box } from '@mui/system'
import { Link as RouterLink } from 'react-router'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import HistoryIcon from '@mui/icons-material/History'
import ReplayIcon from '@mui/icons-material/Replay'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import HelpIcon from '@mui/icons-material/Help'
import { grey } from '@mui/material/colors'
import Acknowledgments from '../about/Acknowledgments'
type WelcomeProps = {
  mode: 'authenticated' | 'anonymous'
}

const Welcome: React.FC<WelcomeProps> = ({ mode }: WelcomeProps) => {
  console.log(`Welcome mode: ${mode}`)
  const { username } = useAuth()
  const isAnonymous = mode === 'anonymous'
  useTitle(
    isAnonymous ? 'BilboMD: Welcome' : `BilboMD: Welcome ${username ?? ''}`
  )
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  const content = (
    <>
      <Grid
        container
        spacing={2}
      >
        <Grid size={12}>
          <Typography
            variant="h2"
            sx={{ my: 3 }}
          >
            Welcome {username}!
          </Typography>
          <Typography sx={{ mb: 2 }}>
            Let&apos;s run some <b>BilboMD</b> simulations.
          </Typography>
        </Grid>
        <Grid size={12}>
          {configIsLoading ? (
            <Alert severity="info">Loading system configuration...</Alert>
          ) : configError ? (
            <Alert severity="error">Failed to load system configuration.</Alert>
          ) : (
            <Box>
              <Typography sx={{ m: 0 }}>
                BilboMD is running in <b>{config.mode}</b> mode
              </Typography>
              BilboMD is deployed to{' '}
              {config.useNersc && config.useNersc.toLowerCase() === 'true' ? (
                <>
                  <span>NERSC</span>
                  <Grid>
                    <NerscSystemStatuses />
                  </Grid>
                </>
              ) : (
                <span>Beamline 12.3.1</span>
              )}
            </Box>
          )}
        </Grid>
        <Grid size={12}>
          <Typography sx={{ mb: 2 }}>
            Support: <Link href="mailto:bilbomd@lbl.gov">bilbomd@lbl.gov</Link>
          </Typography>
        </Grid>
        <Grid size={12}>
          {isAnonymous ? (
            <>
              <Grid size={8}>
                <Typography
                  variant="h4"
                  gutterBottom
                >
                  Welcome to BilboMD
                </Typography>
                <Typography variant="body1">
                  You can run BilboMD anonymously without logging in. Submitted
                  jobs will be accessible via a unique results link — please
                  bookmark it.
                </Typography>
                <Box sx={{ my: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    component={RouterLink}
                    to="/jobs/classic/new"
                  >
                    Run a BilboMD Job
                  </Button>
                </Box>
              </Grid>
              {/* BENEFITS OF ACCOUNT */}
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  my: 2,
                  backgroundColor: grey[300],
                  width: { xs: '100%', sm: '80%', md: '80%', lg: '80%' },
                  maxWidth: '700px'
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 'bold' }}
                  >
                    Benefits of Creating an Account:
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    component={RouterLink}
                    to="/privacy"
                  >
                    Privacy Policy
                  </Button>
                </Box>
                <List dense>
                  <ListItem>
                    <ListItemIcon sx={{ mr: 1 }}>
                      <HistoryIcon />
                    </ListItemIcon>
                    <ListItemText primary="Job History: Track and review all your past BilboMD jobs." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon sx={{ mr: 1 }}>
                      <ReplayIcon />
                    </ListItemIcon>
                    <ListItemText primary="Ability to Resubmit: Easily rerun or modify previous jobs." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon sx={{ mr: 1 }}>
                      <HelpIcon />
                    </ListItemIcon>
                    <ListItemText primary="Staff Support: Get personalized help, feedback, and troubleshooting from our team." />
                  </ListItem>
                </List>
              </Paper>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1">
                  Already have an account?{' '}
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    component={RouterLink}
                    to="/magicklink"
                    startIcon={<AutoFixHighIcon />}
                  >
                    Get a MagickLink&#8482;
                  </Button>
                </Typography>
              </Box>
              <Box>
                <Typography variant="body1">
                  Need an account?{' '}
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    component={RouterLink}
                    to="/register"
                  >
                    Register
                  </Button>
                </Typography>
              </Box>
            </>
          ) : (
            <Box
              display="flex"
              flexDirection="column"
              width="100%"
            >
              <Typography
                variant="h4"
                gutterBottom
              >
                Welcome back, {username || 'user'}!
              </Typography>
              <Typography variant="body1">
                Ready to submit a new BilboMD job or review your previous
                analyses?
              </Typography>
              <Box mt={3}>
                <Button
                  variant="contained"
                  color="primary"
                  component={RouterLink}
                  to="/dashboard/jobs/classic"
                >
                  Submit New Job
                </Button>
                <Box mt={2}>
                  <Button
                    variant="outlined"
                    component={RouterLink}
                    to="/dashboard/jobs"
                  >
                    View My Jobs
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Grid>
        <Acknowledgments />
      </Grid>
    </>
  )

  return content
}

export default Welcome
