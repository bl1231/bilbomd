import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import useAuth from 'hooks/useAuth'

/**
 * What a Jiffy hands to a new BilboMD Classic job: the structure it was
 * working on and the constraints it made, as files, so the job form treats
 * them as if the user had picked them.
 */
export interface ClassicHandoff {
  /** A PDB or mmCIF file */
  structure: File
  /** A const.inp, an OpenMM constraints YAML, or constraints JSON */
  constraints: File
  /** Where they came from, for the form's note: "the Inp Jiffy™" */
  from: string
}

const STATE_KEY = 'classicHandoff'

/** The Classic form for signed-in users, or the public one */
export const classicFormPath = (isAuthenticated: boolean) =>
  isAuthenticated ? '/dashboard/jobs/classic' : '/jobs/classic/new'

/**
 * Opens a new Classic job with the given files. They travel in the router's
 * history state, so nothing is uploaded until the job is submitted. The
 * public form sends signed-in users on to the dashboard and that would drop
 * the state, so the path is picked by sign-in here.
 */
export const useStartClassicJob = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  return useCallback(
    (handoff: ClassicHandoff) =>
      void navigate(classicFormPath(isAuthenticated), {
        state: { [STATE_KEY]: handoff }
      }),
    [navigate, isAuthenticated]
  )
}

/** The hand-off in a location's state, if it holds one */
export const readClassicHandoff = (state: unknown): ClassicHandoff | null => {
  if (typeof state !== 'object' || state === null) return null
  const handoff = (state as Record<string, unknown>)[STATE_KEY]
  if (typeof handoff !== 'object' || handoff === null) return null
  const { structure, constraints, from } = handoff as Record<string, unknown>
  return structure instanceof File &&
    constraints instanceof File &&
    typeof from === 'string'
    ? { structure, constraints, from }
    : null
}
