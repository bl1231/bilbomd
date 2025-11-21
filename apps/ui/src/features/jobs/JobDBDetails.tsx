import React, { useState } from 'react'
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
  Box,
  Tooltip,
  IconButton,
  Chip
} from '@mui/material'
import { useSnackbar } from 'notistack'
import Grid from '@mui/material/Grid'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VisibilityIcon from '@mui/icons-material/Visibility'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CloseIcon from '@mui/icons-material/Close'
import HeaderBox from 'components/HeaderBox'
import { displayPropertiesByJobType } from './JobDBDisplayProperties'
import { formatDateSafe } from 'utils/dates'
import type {
  BilboMDJobDTO,
  BilboMDPDBDTO,
  BilboMDCRDDTO,
  BilboMDAutoDTO,
  BilboMDSANSDTO,
  BilboMDScoperDTO
} from '@bilbomd/bilbomd-types'
import CopyableChip from 'components/CopyableChip'
import { useLazyGetFileByIdAndNameQuery } from 'slices/jobsApiSlice'
import { green } from '@mui/material/colors'
import {
  IFixedBody,
  IRigidBody,
  ISegment,
  IMDConstraints
} from '@bilbomd/mongodb-schema'

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
  // console.log('JobDBDetails: job:', job)
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

  const jobTypeDisplayName: Record<string, string> = {
    pdb: 'BilboMD Classic w/PDB',
    auto: 'BilboMD Auto',
    alphafold: 'BilboMD AlphaFold',
    sans: 'BilboMD SANS',
    crd: 'BilboMD Classic w/CRD/PSF',
    scoper: 'BilboMD Scoper',
    multi: 'BilboMD MultiMD'
  }

  const getJobTypeDisplayName = (type: string | undefined) =>
    type ? jobTypeDisplayName[type] || 'Unknown Job Type' : 'Unknown Job Type'

  const getNumConformations = (job: {
    rg_min?: number
    rg_max?: number
    conformational_sampling?: number
  }) => {
    const { rg_min = 0, rg_max = 0, conformational_sampling = 1 } = job
    const stepSize = Math.max(Math.round((rg_max - rg_min) / 5), 1)
    const rgList: number[] = []
    for (let rg = rg_min; rg <= rg_max; rg += stepSize) {
      rgList.push(rg)
    }
    const numConformations = conformational_sampling * 200 * rgList.length
    return { stepSize, numSteps: rgList.length, numConformations, rgList }
  }

  const baseProperties: MongoDBProperty[] = [
    { label: 'MongoDB ID', value: job.mongo.id },
    { label: 'Pipeline', value: getJobTypeDisplayName(job.mongo.jobType) },
    { label: 'MD Engine', value: job.mongo.md_engine ?? 'CHARMM' },
    { label: 'Submitted', value: job.mongo.time_submitted },
    { label: 'Started', value: job.mongo.time_started },
    { label: 'Completed', value: job.mongo.time_completed },
    { label: 'Data file', value: job.mongo.data_file }
  ]

  const getJobSpecificProperties = (): MongoDBProperty[] => {
    const allowedLabels = displayPropertiesByJobType[job.mongo.jobType] || []

    // Filter base properties
    const staticProperties = baseProperties.filter((prop) =>
      allowedLabels.includes(prop.label)
    )

    // Add dynamic properties
    const dynamicProperties: MongoDBProperty[] = []

    // Display md_constraints if present and non-empty
    if (
      job.mongo.md_constraints &&
      Object.keys(job.mongo.md_constraints).length > 0
    ) {
      const { fixed_bodies = [], rigid_bodies = [] }: IMDConstraints =
        job.mongo.md_constraints

      type BodyType = 'fixed' | 'rigid'
      const renderBody = (body: IFixedBody | IRigidBody, type: BodyType) => (
        <Box
          key={body.name}
          sx={{
            mb: 2,
            p: 1,
            border: 1,
            borderColor: 'grey.300',
            borderRadius: 2,
            backgroundColor: 'grey.100'
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: type === 'fixed' ? '#2f54eb' : '#fa8c16',
              mb: 1
            }}
          >
            {body.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {body.segments?.map((segment: ISegment) => (
              <Box
                key={segment.chain_id + segment.residues.start}
                sx={{
                  p: 1,
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                  minWidth: 180
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, mb: 0.5 }}
                >
                  Chain: {segment.chain_id}
                </Typography>
                <Chip
                  label={`Residues: ${segment.residues?.start} - ${segment.residues?.stop}`}
                  variant="outlined"
                  sx={{
                    fontSize: '0.85rem',
                    mb: 0.5,
                    color: type === 'fixed' ? '#2f54eb' : '#fa8c16'
                  }}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )
      dynamicProperties.push({
        label: 'MD Constraints',
        render: () => (
          <Box sx={{ width: '75%' }}>
            <Box
              sx={{
                backgroundColor: 'background.paper',
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 2,
                p: 2,
                mb: 1,
                boxShadow: 0
              }}
            >
              {fixed_bodies.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 500, mb: 1 }}
                  >
                    Fixed Bodies
                  </Typography>
                  {fixed_bodies.map((body) => renderBody(body, 'fixed'))}
                </Box>
              )}
              {rigid_bodies.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 500, mb: 1 }}
                  >
                    Rigid Bodies
                  </Typography>
                  {rigid_bodies.map((body) => renderBody(body, 'rigid'))}
                </Box>
              )}
              {fixed_bodies.length === 0 && rigid_bodies.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  No constraints found.
                </Typography>
              )}
            </Box>
          </Box>
        )
      })
    }

    if (job.mongo.jobType === 'sans') {
      const specificJob = job.mongo as BilboMDSANSDTO

      const { stepSize, numSteps, numConformations, rgList } =
        getNumConformations(specificJob)
      dynamicProperties.push(
        { label: 'PDB file', value: specificJob.pdb_file },
        {
          label: 'Solvent D20 Fraction',
          value: specificJob.d2o_fraction,
          suffix: '%'
        },
        {
          label: 'MD constraint file',
          render: () => (
            <Chip
              label={
                <Box style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '6px' }}>
                    {specificJob.const_inp_file || 'No constraint file'}
                  </span>
                  <Tooltip
                    title={`Open ${specificJob.const_inp_file || 'constraint file'}`}
                  >
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenModal()
                      }}
                      sx={{ padding: 0 }}
                      disabled={!specificJob.const_inp_file}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
              variant="outlined"
              sx={{
                fontSize: '0.875rem',
                borderColor: 'primary.main',
                backgroundColor: green[100],
                cursor: specificJob.const_inp_file ? 'pointer' : 'default'
              }}
              onClick={specificJob.const_inp_file ? handleOpenModal : undefined}
            />
          )
        },
        { label: 'Rg min', value: specificJob.rg_min, suffix: 'Å' },
        { label: 'Rg max', value: specificJob.rg_max, suffix: 'Å' },
        { label: 'Rg step size', value: stepSize, suffix: 'Å' },
        { label: 'Number of CHARMM MD Runs', value: numSteps },
        { label: 'Number of conformations', value: numConformations },
        {
          label: 'Rg List',
          render: () => (
            <Typography>
              {rgList?.map((rgValue, index) => (
                <span key={index}>
                  {rgValue}&#8491; {index < rgList.length - 1 ? ', ' : ''}
                </span>
              ))}
            </Typography>
          )
        }
      )
    }

    if (job.mongo.jobType === 'scoper') {
      const specificJob = job.mongo as BilboMDScoperDTO
      dynamicProperties.push({ label: 'PDB file', value: specificJob.pdb_file })
    }

    if (
      job.mongo.jobType === 'pdb' ||
      job.mongo.jobType === 'crd' ||
      job.mongo.jobType === 'auto'
    ) {
      const specificJob = job.mongo as
        | BilboMDPDBDTO
        | BilboMDCRDDTO
        | BilboMDAutoDTO
      const { stepSize, numSteps, numConformations, rgList } =
        getNumConformations(specificJob)
      dynamicProperties.push(
        { label: 'PDB file', value: specificJob.pdb_file },
        { label: 'PSF file', value: specificJob.psf_file },
        { label: 'CRD file', value: specificJob.crd_file },
        {
          label: 'MD constraint file',
          render: () => (
            <Chip
              label={
                <Box style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '6px' }}>
                    {specificJob.const_inp_file || 'No constraint file'}
                  </span>
                  <Tooltip
                    title={`Open ${specificJob.const_inp_file || 'constraint file'}`}
                  >
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenModal()
                        }}
                        sx={{ padding: 0 }}
                        disabled={!specificJob.const_inp_file}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              }
              variant="outlined"
              sx={{
                fontSize: '0.875rem',
                borderColor: 'primary.main',
                backgroundColor: green[100],
                cursor: specificJob.const_inp_file ? 'pointer' : 'default'
              }}
              onClick={specificJob.const_inp_file ? handleOpenModal : undefined}
            />
          )
        },
        { label: 'Rg min', value: specificJob.rg_min, suffix: 'Å' },
        { label: 'Rg max', value: specificJob.rg_max, suffix: 'Å' },
        { label: 'Rg step size', value: stepSize, suffix: 'Å' },
        { label: 'Number of MD Runs', value: numSteps },
        { label: 'Number of conformations', value: numConformations },
        {
          label: 'Rg List',
          render: () => (
            <Typography>
              {rgList?.map((rgValue, index) => (
                <span key={index}>
                  {rgValue}&#8491; {index < rgList.length - 1 ? ', ' : ''}
                </span>
              ))}
            </Typography>
          )
        }
      )
    }

    return [...staticProperties, ...dynamicProperties]
  }

  const filteredProperties: MongoDBProperty[] = [
    ...baseProperties,
    ...getJobSpecificProperties()
  ]

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
            <Grid size={{ xs: 12 }}>
              {renderProperties(filteredProperties)}
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
      <Dialog
        open={open}
        onClose={handleCloseModal}
        fullWidth
        maxWidth="md"
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: green[100],
            color: 'black'
          }
        }}
      >
        <DialogTitle>
          CHARMM Constraint File
          <Tooltip title="Copy to clipboard">
            <IconButton
              aria-label="copy-constraint-file"
              onClick={handleCopyToClipboard}
              sx={{
                position: 'absolute',
                right: 64,
                top: 16
              }}
            >
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <IconButton
          aria-label="close"
          onClick={handleCloseModal}
          sx={(theme) => ({
            position: 'absolute',
            right: 16,
            top: 16,
            color: theme.palette.grey[500]
          })}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '200px'
              }}
            >
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error">Failed to load file contents.</Typography>
          ) : (
            <Typography
              component="pre"
              sx={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                fontFamily: 'monospace'
              }}
            >
              {fileContents || 'No content available.'}
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}

export default JobDBDetails
