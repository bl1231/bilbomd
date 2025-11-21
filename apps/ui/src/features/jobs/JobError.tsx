import { axiosInstance, AxiosResponse } from 'app/api/axios'
import type { BilboMDJobDTO, StepStatus } from '@bilbomd/bilbomd-types'
import { useSelector } from 'react-redux'
import { selectCurrentToken } from 'slices/authSlice'
import { useEffect, useState, useCallback } from 'react'
import { Box } from '@mui/system'
import Grid from '@mui/material/Grid'

interface JobProps {
  job: BilboMDJobDTO
}

const JobError = ({ job }: JobProps) => {
  const token = useSelector(selectCurrentToken)
  const [logContent, setLogContent] = useState('')
  const [stepWithError, setStepWithError] = useState<string | null>(null)

  const getErrorLog = useCallback(
    async (id: string, step: string) => {
      try {
        const response: AxiosResponse = await axiosInstance.get(
          `jobs/${id}/logs?step=${step}`,
          {
            responseType: 'json',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )
        setLogContent(response.data.logContent)
      } catch (error) {
        console.error('Error fetching log file:', error)
      }
    },
    [token]
  )

  useEffect(() => {
    if (job.mongo.steps && typeof job.mongo.steps === 'object') {
      const erroredEntry = Object.entries(job.mongo.steps).find(
        ([, stepStatus]) => stepStatus.status === 'Error'
      )
      setStepWithError(erroredEntry ? erroredEntry[0] : null)
    }
  }, [job])

  useEffect(() => {
    if (stepWithError) {
      void getErrorLog(job.mongo.id, stepWithError)
    }
  }, [stepWithError, job.mongo.id, getErrorLog])

  return (
    <Box sx={{ m: 2 }}>
      <Grid>
        <pre>{logContent}</pre>
      </Grid>
    </Box>
  )
}

export default JobError
