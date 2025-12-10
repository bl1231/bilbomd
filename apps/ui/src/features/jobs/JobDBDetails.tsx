import React, { useState } from 'react'
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Box
} from '@mui/material'
import { useSnackbar } from 'notistack'
import Grid from '@mui/material/Grid'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HeaderBox from 'components/HeaderBox'
import { formatDateSafe } from 'utils/dates'
import type {
  BilboMDJobDTO,
  BilboMDPDBDTO,
  BilboMDCRDDTO,
  BilboMDAutoDTO,
  BilboMDSANSDTO
} from '@bilbomd/bilbomd-types'
import CopyableChip from 'components/CopyableChip'
import { useLazyGetFileByIdAndNameQuery } from 'slices/jobsApiSlice'
import { useJobProperties } from '../results/hooks/useJobProperties'
import { FileModal } from '../results/components/FileModal'

interface JobDBDetailsProps {
  job: BilboMDJobDTO
}

type MongoDBProperty = {
  label: string
  value?: string | number | Date
  suffix?: string
  render?: () => React.ReactNode
}

const JobDBDetails: React.FC<JobDBDetailsProps> = ({ job }) => {
  const [open, setOpen] = useState(false)
  const { enqueueSnackbar } = useSnackbar()
  const [triggerGetFile, { data: fileContents, isLoading, error }] =
    useLazyGetFileByIdAndNameQuery()

  const handleOpenModal = () => {
    setOpen(true)
    if (
      job.mongo.jobType === 'pdb' ||
      job.mongo.jobType === 'crd' ||
      job.mongo.jobType === 'auto' ||
      job.mongo.jobType === 'sans'
    ) {
      const specificJob = job.mongo as
        | BilboMDPDBDTO
        | BilboMDCRDDTO
        | BilboMDAutoDTO
        | BilboMDSANSDTO
      void triggerGetFile({
        id: job.mongo.id,
        filename: specificJob.const_inp_file || ''
      })
    }
  }

  const handleCloseModal = () => setOpen(false)

  const handleCopyToClipboard = () => {
    if (fileContents) {
      void navigator.clipboard.writeText(fileContents)
      enqueueSnackbar('File contents copied to clipboard!', {
        variant: 'default'
      })
    }
  }

  const properties = useJobProperties(job, handleOpenModal)

  const renderProperties = (props: MongoDBProperty[]) => (
    <Stack spacing={1}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Typography fontWeight="bold">UUID:</Typography>
        <CopyableChip
          label="UUID"
          value={job.mongo.uuid}
        />
      </Box>
      {job.mongo.access_mode === 'anonymous' && job.mongo.public_id && (
        <>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography fontWeight="bold">Public UUID:</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CopyableChip
                label="Public UUID"
                value={job.mongo.public_id}
                url={`/results/${job.mongo.public_id}`}
              />
            </Box>
          </Box>
        </>
      )}

      {props.map(({ label, value, render, suffix = '' }) =>
        render ? (
          <Box
            key={label}
            sx={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <Typography fontWeight="bold">{label}:</Typography>
            {render()}
          </Box>
        ) : (
          value !== undefined && (
            <Box
              key={label}
              sx={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <Typography fontWeight="bold">{label}:</Typography>
              <Typography>
                {(() => {
                  if (value instanceof Date) {
                    return formatDateSafe(value)
                  }
                  if (typeof value === 'string' && !isNaN(Date.parse(value))) {
                    return formatDateSafe(value)
                  }
                  return String(value)
                })()}
                {suffix}
              </Typography>
            </Box>
          )
        )
      )}
    </Stack>
  )

  return (
    <Box sx={{ flexGrow: 1, width: '100%' }}>
      <Accordion
        defaultExpanded={job.mongo.status === 'Completed' ? false : true}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
          sx={{
            backgroundColor: '#888',
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            pl: 1
          }}
        >
          <HeaderBox sx={{ py: 0 }}>
            <Typography>Details</Typography>
          </HeaderBox>
        </AccordionSummary>

        <AccordionDetails>
          <Grid
            container
            spacing={2}
          >
            <Grid size={{ xs: 12 }}>{renderProperties(properties)}</Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      <FileModal
        open={open}
        onClose={handleCloseModal}
        fileContents={fileContents}
        isLoading={isLoading}
        error={
          error
            ? typeof error === 'string'
              ? error
              : 'status' in error && 'data' in error
                ? `Error: ${error.status} - ${JSON.stringify(error.data)}`
                : 'message' in error
                  ? error.message
                  : 'An unknown error occurred'
            : undefined
        }
        onCopyToClipboard={handleCopyToClipboard}
      />
    </Box>
  )
}

export default JobDBDetails
