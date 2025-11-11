import { Typography, Alert, AlertTitle, Button, Tooltip } from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'
// import CopyableChip from 'components/CopyableChip'
import { green } from '@mui/material/colors'
import { useNavigate } from 'react-router'

type JobSuccessAlertProps = {
  jobResponse: {
    message: string
    jobid: string
    uuid: string
    md_engine: string
  }
  jobType: string
}

const JobSuccessAlert = ({ jobResponse, jobType }: JobSuccessAlertProps) => {
  const navigate = useNavigate()
  return (
    <Alert severity="success">
      <AlertTitle>Job submitted!</AlertTitle>
      <Typography>
        Your <b>BilboMD {jobType} job</b> has been submitted.
      </Typography>
      {jobResponse && jobResponse.jobid && (
        <Typography sx={{ my: 1 }}>
          You can monitor the status of your job here:
        </Typography>
      )}
      {jobResponse && jobResponse.jobid && (
        <>
          <Tooltip title="GoGoGo... View job status">
            <Button
              variant="outlined"
              startIcon={<LaunchIcon />}
              sx={{
                ml: 0,
                backgroundColor: green[100],
                borderColor: 'primary.main'
              }}
              onClick={() => navigate(`/dashboard/jobs/${jobResponse.jobid}`)}
            >
              View Job Status
            </Button>
          </Tooltip>
        </>
      )}
    </Alert>
  )
}

export default JobSuccessAlert
