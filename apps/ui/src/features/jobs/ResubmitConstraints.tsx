import { useCallback, useMemo } from 'react'
import { Alert, LinearProgress } from '@mui/material'
import {
  importConstraintsFromConstInp,
  inputFromStored,
  type ConstraintMode,
  type ConstraintsInput,
  type MDConstraintsDTO,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { useGetFileByIdAndNameQuery } from 'slices/jobsApiSlice'
import { ConstraintsField } from 'features/constraints/ConstraintsField'

interface ResubmitConstraintsProps {
  jobId: string
  mode: ConstraintMode
  /** The structure field's value: a newly picked File, or the original's name */
  structure: File | string
  /** The original job's constraint file (const.inp or openmm_const.yml) */
  constFileName?: string
  mdConstraints?: MDConstraintsDTO
  engine: 'charmm' | 'openmm'
  disabled?: boolean
}

const isInput = (value: unknown): value is ConstraintsInput =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { fixed_bodies?: unknown }).fixed_bodies) &&
  (value as { fixed_bodies: unknown[] }).fixed_bodies.length > 0

/**
 * The constraints editor on the resubmit form. Without a newly picked file it
 * reads the original job's structure, and starts from the original job's
 * constraints: its stored md_constraints, or, for older CRD/PSF jobs whose
 * stored constraints lack segids, its const.inp read here in the browser.
 */
export const ResubmitConstraints = ({
  jobId,
  mode,
  structure,
  constFileName,
  mdConstraints,
  engine,
  disabled
}: ResubmitConstraintsProps) => {
  const reuseStructure = !(structure instanceof File) && structure !== ''
  const original = useGetFileByIdAndNameQuery(
    { id: jobId, filename: structure as string },
    { skip: !reuseStructure }
  )
  // Stored constraints without segids can't name CRD/PSF segments
  const storedUsable = useMemo(
    () =>
      !!mdConstraints?.fixed_bodies?.length &&
      (mode === 'pdb' ||
        [
          ...(mdConstraints.fixed_bodies ?? []),
          ...(mdConstraints.rigid_bodies ?? [])
        ].every((b) => b.segments.every((s) => s.segid))),
    [mdConstraints, mode]
  )
  const constInp = useGetFileByIdAndNameQuery(
    { id: jobId, filename: constFileName ?? '' },
    { skip: storedUsable || !constFileName?.endsWith('.inp') }
  )

  const structureFile = useMemo(
    () =>
      structure instanceof File
        ? structure
        : original.data !== undefined
          ? new File([original.data], structure)
          : '',
    [structure, original.data]
  )

  const initialFor = useCallback(
    (segments: StructureSegment[]): ConstraintsInput | null => {
      if (storedUsable) {
        const input = inputFromStored(mdConstraints, mode)
        return isInput(input) ? input : null
      }
      if (constInp.data !== undefined) {
        return importConstraintsFromConstInp(constInp.data, mode, {
          structure: segments
        }).input
      }
      return null
    },
    [storedUsable, mdConstraints, mode, constInp.data]
  )

  if (reuseStructure && original.isLoading) return <LinearProgress />
  if (reuseStructure && original.isError) {
    return (
      <Alert severity="warning">
        The original structure file could not be read. Pick it again to set up
        the constraints.
      </Alert>
    )
  }
  if (constInp.isLoading) return <LinearProgress />

  return (
    <ConstraintsField
      name="constraints"
      mode={mode}
      structureFile={structureFile}
      engine={engine}
      disabled={disabled}
      initialFor={initialFor}
    />
  )
}
