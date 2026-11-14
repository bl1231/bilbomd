import { useEffect, useState } from 'react'
import { Alert } from '@mui/material'
import {
  constInpCloseBodiesMessage,
  MIN_FLEX_GAP
} from '@bilbomd/bilbomd-types'

/**
 * A warning under a job form's const.inp field when two constraint bodies on
 * a chain have fewer than MIN_FLEX_GAP flexible residues between them. It
 * doesn't block submission (#1101). Shows nothing for a file kept from an
 * earlier job (a name, not a File) or one that can't be read.
 */
const ConstInpGapWarning = ({ file }: { file: unknown }) => {
  // The message for the file it was worked out for, so a newer pick never
  // shows an older file's warning
  const [checked, setChecked] = useState<{
    file: File
    message: string | null
  } | null>(null)

  useEffect(() => {
    if (!(file instanceof File)) return
    let active = true
    file
      .text()
      .then((text) => {
        if (active) {
          setChecked({ file, message: constInpCloseBodiesMessage(text) })
        }
      })
      .catch(() => {
        if (active) setChecked({ file, message: null })
      })
    return () => {
      active = false
    }
  }, [file])

  const message = checked && checked.file === file ? checked.message : null
  if (!message) return null
  return (
    <Alert
      severity="warning"
      sx={{ mt: 1, maxWidth: '520px' }}
      data-testid="const-inp-gap-warning"
      title={`At least ${MIN_FLEX_GAP} flexible residues between bodies is recommended`}
    >
      {message}
    </Alert>
  )
}

export default ConstInpGapWarning
