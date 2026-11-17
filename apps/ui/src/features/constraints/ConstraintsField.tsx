import { useCallback, useEffect, useRef } from 'react'
import { useField } from 'formik'
import { Alert, CircularProgress, Stack, Typography } from '@mui/material'
import {
  validateConstraintsInput,
  type ConstraintMode,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { ConstraintsEditor } from './ConstraintsEditor'
import { defaultConstraints } from './constraintsModel'
import { useStructureSegments } from './useStructureSegments'

interface ConstraintsFieldProps {
  /** Formik field holding ConstraintsInput | null */
  name: string
  mode: ConstraintMode
  /** The structure file picked in the form: PDB/mmCIF, or PSF for CRD jobs */
  structureFile: File | string
  engine: 'charmm' | 'openmm'
  disabled?: boolean
  /**
   * Constraints to start from when the first structure loads (e.g. the
   * original job's, on resubmit); null or absent starts from every segment
   * fixed. A structure picked later always starts from the default.
   */
  initialFor?: (segments: StructureSegment[]) => ConstraintsInput | null
}

/**
 * The constraints part of a job form. Reads the picked structure file,
 * starts from "everything fixed", and blocks submission until the
 * constraints pass the same checks the server runs.
 */
export const ConstraintsField = ({
  name,
  mode,
  structureFile,
  engine,
  disabled,
  initialFor
}: ConstraintsFieldProps) => {
  const structure = useStructureSegments(structureFile)
  const segments = structure.status === 'ready' ? structure.segments : null

  const validate = useCallback(
    (value: ConstraintsInput | null) => {
      if (!segments) return 'Select a structure file to set up constraints'
      if (!value) return 'Constraints are required'
      const result = validateConstraintsInput(value, { mode, segments })
      return result.ok ? undefined : 'Fix the constraints shown above'
    },
    [mode, segments]
  )
  const [field, , helpers] = useField<ConstraintsInput | null>({
    name,
    validate
  })
  const { setValue } = helpers

  // The first structure may start from given constraints; any other starts
  // from every segment fixed, since old constraints refer to chains that may
  // no longer exist
  const firstSegments = useRef<StructureSegment[] | null>(null)
  useEffect(() => {
    if (!segments) {
      void setValue(null)
      return
    }
    firstSegments.current ??= segments
    // Compared by identity, so an effect run again for the same structure
    // (React StrictMode) applies the same starting point
    const initial =
      segments === firstSegments.current
        ? (initialFor?.(segments) ?? null)
        : null
    void setValue(initial ?? defaultConstraints(mode, segments))
    // setValue and initialFor change identity on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, mode])

  if (structure.status === 'none') {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
      >
        Select a {mode === 'crd_psf' ? 'PSF' : 'PDB or CIF'} file to set up the
        fixed and rigid bodies.
      </Typography>
    )
  }
  if (structure.status === 'reading') {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center' }}
      >
        <CircularProgress size={16} />
        <Typography variant="body2">Reading the structure…</Typography>
      </Stack>
    )
  }
  if (structure.status === 'error') {
    return <Alert severity="error">{structure.message}</Alert>
  }
  if (!field.value) return null

  return (
    <ConstraintsEditor
      mode={mode}
      segments={structure.segments}
      value={field.value}
      onChange={(value) => void setValue(value)}
      engine={engine}
      disabled={disabled}
    />
  )
}
