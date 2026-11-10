import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  Typography
} from '@mui/material'
import type { MwCheckResponse } from '@bilbomd/bilbomd-types'
import { useCheckMwMutation } from 'slices/mwCheckApiSlice'
import { describeDiff } from 'features/analysis/feedbackModel'
import { mwCheckRequest, type MwCheckInputs } from './mwCheckModel'

type State =
  | { status: 'idle' }
  | { status: 'checking'; key: string }
  | { status: 'done'; key: string; result: MwCheckResponse }

const kDa = (value: number | null): string =>
  typeof value === 'number' ? `${value.toFixed(1)} kDa` : 'unknown'

const Masses = ({ result }: { result: MwCheckResponse }) => (
  <>
    Your model weighs {kDa(result.mw.model_kda)}; the SAXS data suggest about{' '}
    {kDa(result.mw.saxs_kda)}
    {typeof result.mw.diff_fraction === 'number' &&
      ` (${describeDiff(result.mw.diff_fraction)})`}
    .
  </>
)

const Result = ({ result }: { result: MwCheckResponse }) => {
  const { finding, mw } = result
  switch (finding.code) {
    case 'mw_differs':
      return (
        <Alert
          severity="warning"
          variant="outlined"
        >
          <AlertTitle>Your model and your SAXS data may not match</AlertTitle>
          <Masses result={result} /> A mismatch like this is the most common
          reason BilboMD cannot find a good fit. Check that the sequence and the
          oligomeric state of the model are those of the sample
          {(mw.diff_fraction ?? 0) > 0
            ? ', and that the sample is not aggregated'
            : ''}
          . The SAXS estimate is approximate, and you can still submit.
        </Alert>
      )
    case 'mw_consistent':
      return (
        <Alert
          severity="success"
          variant="outlined"
        >
          <Masses result={result} /> The two are consistent.
        </Alert>
      )
    case 'mw_low_confidence':
      return (
        <Alert
          severity="info"
          variant="outlined"
        >
          <Masses result={result} /> {mw.reason}
        </Alert>
      )
    default:
      // Nothing to compare: say why, quietly
      return mw.reason ? (
        <Typography
          variant="body2"
          color="text.secondary"
        >
          The model&apos;s mass could not be compared with the SAXS data.{' '}
          {mw.reason}
        </Typography>
      ) : null
  }
}

// Compares the mass of the model on a job form with the mass the uploaded
// SAXS data suggest, as soon as both are present. Advisory only: it shows a
// notice and never affects whether the form can be submitted.
const MwCheck = ({
  datFile,
  qUnits,
  pdbFile,
  psfFile,
  entities
}: MwCheckInputs) => {
  const [checkMw] = useCheckMwMutation()
  const [state, setState] = useState<State>({ status: 'idle' })

  const request = useMemo(
    () => mwCheckRequest({ datFile, qUnits, pdbFile, psfFile, entities }),
    [datFile, qUnits, pdbFile, psfFile, entities]
  )
  const key = request?.key

  useEffect(() => {
    if (!request) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setState({ status: 'checking', key: request.key })
      checkMw(request.build())
        .unwrap()
        .then((result) => {
          if (!cancelled) {
            setState({ status: 'done', key: request.key, result })
          }
        })
        .catch(() => {
          // The check is a courtesy; a failed one is not worth a message
          if (!cancelled) setState({ status: 'idle' })
        })
    }, request.delayMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `key` stands in for `request`, which is rebuilt on every render of a
    // form with sequences
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, checkMw])

  if (state.status === 'idle' || state.key !== key) return null

  return (
    <Box
      sx={{ my: 1, maxWidth: '85ch' }}
      aria-live="polite"
    >
      {state.status === 'checking' ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <CircularProgress size={14} />
          Comparing the model&apos;s mass with the SAXS data…
        </Typography>
      ) : (
        <Result result={state.result} />
      )}
    </Box>
  )
}

export default MwCheck
