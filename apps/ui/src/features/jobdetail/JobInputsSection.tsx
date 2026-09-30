import { useCallback, useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useSnackbar } from 'notistack'
import HeaderBox from 'components/HeaderBox'
import CopyableChip from 'components/CopyableChip'
import { useLazyGetFileByIdAndNameQuery } from 'slices/jobsApiSlice'
import { useJobProperties } from 'features/results/hooks/useJobProperties'
import { FileModal } from 'features/results/components/FileModal'
import type { JobSource } from './jobSource'
import type { JobView } from './jobView'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 0.5
    }}
  >
    <Typography sx={{ fontWeight: 'bold' }}>{label}:</Typography>
    {children}
  </Box>
)

const TextValue = ({ children }: { children: ReactNode }) => (
  <Typography
    sx={{ minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }}
  >
    {children}
  </Typography>
)

const errorText = (error: unknown): string | undefined => {
  if (!error) return undefined
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'status' in error && 'data' in error) {
    return `Error: ${String(error.status)} - ${JSON.stringify(error.data)}`
  }
  if (typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'An unknown error occurred'
}

// The owner's constraint-file viewer
const useConstraintFileModal = (source: JobSource, filename?: string) => {
  const { enqueueSnackbar } = useSnackbar()
  const [open, setOpen] = useState(false)
  const [triggerGetFile, { data, isLoading, error }] =
    useLazyGetFileByIdAndNameQuery()

  const jobId = source.kind === 'owner' ? source.id : undefined
  const onOpen = useCallback(() => {
    if (!jobId || !filename) return
    setOpen(true)
    void triggerGetFile({ id: jobId, filename })
  }, [jobId, filename, triggerGetFile])

  const modal = (
    <FileModal
      open={open}
      onClose={() => setOpen(false)}
      fileContents={data}
      isLoading={isLoading}
      error={errorText(error)}
      onCopyToClipboard={() => {
        if (!data) return
        void navigator.clipboard.writeText(data)
        enqueueSnackbar('File contents copied to clipboard!', {
          variant: 'default'
        })
      }}
    />
  )

  return { onOpen: jobId ? onOpen : undefined, modal }
}

const JobInputsSection = ({
  source,
  view
}: {
  source: JobSource
  view: JobView
}) => {
  const { onOpen, modal } = useConstraintFileModal(
    source,
    view.inputs.const_inp_file
  )
  const properties = useJobProperties(view, onOpen)
  const combined = view.inputs.bilbomd_uuids ?? []

  return (
    <>
      <Accordion defaultExpanded={false}>
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
            <Typography>Inputs &amp; parameters</Typography>
          </HeaderBox>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            {properties.map(({ label, value, render, suffix = '' }) => {
              if (render) {
                return (
                  <Row
                    key={label}
                    label={label}
                  >
                    {render()}
                  </Row>
                )
              }
              if (value === undefined) return null
              return (
                <Row
                  key={label}
                  label={label}
                >
                  <TextValue>
                    {String(value)}
                    {suffix}
                  </TextValue>
                </Row>
              )
            })}
            {combined.length > 0 && (
              <Row label="Combined">
                <Box>
                  {combined.map((uuid) => (
                    <Box
                      key={uuid}
                      sx={{ my: 1 }}
                    >
                      <CopyableChip
                        label="UUID"
                        value={uuid}
                      />
                    </Box>
                  ))}
                </Box>
              </Row>
            )}
            {source.kind === 'owner' &&
              view.accessMode === 'anonymous' &&
              view.publicId && (
                <Row label="Public link">
                  <CopyableChip
                    label="Public UUID"
                    value={view.publicId}
                    url={`/results/${view.publicId}`}
                  />
                </Row>
              )}
            <Row label="UUID">
              <CopyableChip
                label="UUID"
                value={view.uuid}
              />
            </Row>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {modal}
    </>
  )
}

export default JobInputsSection
