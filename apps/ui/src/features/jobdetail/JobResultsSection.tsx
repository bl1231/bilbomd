import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import { useDeleteJobMutation } from 'slices/jobsApiSlice'
import { logger } from 'utils/logger'
import type { JobSource } from './jobSource'
import type { JobView } from './jobView'
import { resubmitPath } from './jobPageModel'

const DeleteJobButton = ({ id }: { id: string }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [deleteJob, { isLoading }] = useDeleteJobMutation()

  const handleDelete = async () => {
    try {
      await deleteJob({ id }).unwrap()
      void navigate('/dashboard/jobs')
    } catch (err) {
      logger.error('Failed to delete the job:', err)
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
      >
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this job? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpen(false)}
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleDelete()}
            color="error"
            variant="contained"
            disabled={isLoading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

type JobResultsSectionProps = {
  source: JobSource
  view: JobView
  onDownload: () => void
  isDownloading: boolean
  downloadError: string | null
  onClearDownloadError: () => void
}

// Download for completed jobs, plus the owner's Resubmit and Delete, which
// are also offered once a job has failed.
const JobResultsSection = ({
  source,
  view,
  onDownload,
  isDownloading,
  downloadError,
  onClearDownloadError
}: JobResultsSectionProps) => {
  const navigate = useNavigate()
  const completed = view.status === 'Completed'
  const resubmit = source.kind === 'owner' ? resubmitPath(view) : undefined

  return (
    <>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Results</Typography>
      </HeaderBox>
      <Item>
        {completed && view.resultsReady === false && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
          >
            Results archive packaging failed for this job. The BilboMD data is
            available on the server, but the download archive could not be
            created. Please contact support.
          </Alert>
        )}
        {downloadError && (
          <Alert
            severity="error"
            onClose={onClearDownloadError}
            sx={{ mb: 2 }}
          >
            {downloadError}
          </Alert>
        )}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            mb: completed ? 2 : 0
          }}
        >
          {completed && (
            <Button
              variant="contained"
              disabled={isDownloading || view.resultsReady === false}
              onClick={onDownload}
            >
              Download Results
            </Button>
          )}
          {resubmit && (
            <Button
              variant="contained"
              onClick={() => void navigate(resubmit)}
            >
              Resubmit
            </Button>
          )}
          {source.kind === 'owner' && <DeleteJobButton id={source.id} />}
        </Box>
        {completed && (
          <Typography>
            The results tar archive contains your original files plus the output
            files from BilboMD.
          </Typography>
        )}
      </Item>
    </>
  )
}

export default JobResultsSection
