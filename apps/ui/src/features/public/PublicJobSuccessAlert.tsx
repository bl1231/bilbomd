import {
  Typography,
  Alert,
  AlertTitle,
  IconButton,
  Tooltip
} from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'
import CopyableChip from 'components/CopyableChip'
import { green } from '@mui/material/colors'
import { useNavigate } from 'react-router'

type PublicJobSuccessAlertProps = {
  jobResponse: {
    resultUrl?: string
    publicId?: string
  }
  jobType: string
}

const PublicJobSuccessAlert = ({
  jobResponse,
  jobType
}: PublicJobSuccessAlertProps) => {
  const navigate = useNavigate()
  return (
    <Alert severity="success">
      <AlertTitle>Job submitted!</AlertTitle>
      <Typography>
        Your anonymous <b>BilboMD {jobType} job</b> has been submitted.
      </Typography>
      {jobResponse && jobResponse.resultUrl && (
        <Typography sx={{ my: 2 }}>
          Please save this link to access your results later:
        </Typography>
      )}
      {jobResponse && jobResponse.resultUrl && (
        <>
          <CopyableChip
            label="Permalink"
            value={jobResponse.resultUrl}
          />
          <Tooltip title="GoGoGo... View Results">
            <IconButton
              sx={{
                ml: 1,
                backgroundColor: green[100],
                borderColor: 'primary.main'
              }}
              onClick={() => navigate(`/results/${jobResponse.publicId}`)}
            >
              <LaunchIcon />
            </IconButton>
          </Tooltip>
        </>
      )}
      {jobResponse && jobResponse.publicId && !jobResponse.resultUrl && (
        <Typography sx={{ wordBreak: 'break-all' }}>
          Results ID: {jobResponse.publicId}
        </Typography>
      )}
    </Alert>
  )
}

export default PublicJobSuccessAlert
