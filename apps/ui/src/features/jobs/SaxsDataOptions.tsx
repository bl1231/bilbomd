import { useEffect, useState } from 'react'
import { useFormikContext } from 'formik'
import { Alert, Box, MenuItem, TextField } from '@mui/material'
import { isQUnits } from '@bilbomd/bilbomd-types'
import type { QUnits } from '@bilbomd/bilbomd-types'
import { analyzeSaxsFile } from 'schemas/ValidationFunctions'

interface SaxsFormValues {
  dat_file: File | string
  q_units: QUnits
}

interface SaxsDataOptionsProps {
  disabled?: boolean
  // Called after the user picks different units, e.g. to recalculate Rg
  onUnitsChange?: (qUnits: QUnits) => void
}

const Q_UNIT_OPTIONS: { value: QUnits; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'A', label: 'Å⁻¹ (inverse ångströms)' },
  { value: 'nm', label: 'nm⁻¹ (inverse nanometers)' }
]

// Sits under the SAXS data file selector of a job form. Lets the user state
// the q units of their file and shows what BilboMD will change in the data
// (unit conversion, q-range trimming) before the job is submitted.
const SaxsDataOptions = ({ disabled, onUnitsChange }: SaxsDataOptionsProps) => {
  const { values, setFieldValue } = useFormikContext<SaxsFormValues>()
  const { dat_file: datFile, q_units: qUnits } = values
  const [analyzed, setAnalyzed] = useState<{
    file: File
    qUnits: QUnits
    warnings: string[]
  } | null>(null)

  useEffect(() => {
    if (!(datFile instanceof File)) return
    let cancelled = false
    void analyzeSaxsFile(datFile, qUnits).then((analysis) => {
      if (cancelled) return
      setAnalyzed({
        file: datFile,
        qUnits,
        warnings: analysis.valid ? analysis.warnings : []
      })
    })
    return () => {
      cancelled = true
    }
  }, [datFile, qUnits])

  // Only show warnings that belong to the current file and units
  const warnings =
    analyzed && analyzed.file === datFile && analyzed.qUnits === qUnits
      ? analyzed.warnings
      : []

  return (
    <Box sx={{ mt: 1, mb: 1, width: '100%', maxWidth: '520px' }}>
      <TextField
        select
        size="small"
        id="q_units"
        name="q_units"
        label="q units of SAXS data"
        value={qUnits}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          if (!isQUnits(next)) return
          void setFieldValue('q_units', next, true)
          onUnitsChange?.(next)
        }}
        helperText="BilboMD works in Å⁻¹. Data in nm⁻¹ are converted for you."
        sx={{ minWidth: '260px' }}
      >
        {Q_UNIT_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            value={option.value}
          >
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      {warnings.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mt: 1 }}
        >
          {warnings.length === 1 ? (
            warnings[0]
          ) : (
            <Box
              component="ul"
              sx={{ m: 0, pl: 2 }}
            >
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}
    </Box>
  )
}

export default SaxsDataOptions
