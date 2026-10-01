import { alpha, type Theme } from '@mui/material/styles'
import type { JobType } from '@bilbomd/bilbomd-types'
import type { JobView } from './jobView'

export type AnalysisTab = 'foxs' | 'movies' | 'feedback' | 'pae'

const FOXS_JOB_TYPES: JobType[] = [
  'pdb',
  'crd',
  'auto',
  'alphafold',
  'openfold'
]

// These start from a predicted structure, and pae2const.py writes pae.png and
// viz.png into the job directory while building the constraints.
const PAE_JOB_TYPES: JobType[] = ['auto', 'alphafold', 'openfold']

// SANS runs MD but not FoXS; Scoper has its own analysis section and Multi
// only combines other jobs' results.
export const analysisTabs = (jobType: JobType): AnalysisTab[] => {
  if (PAE_JOB_TYPES.includes(jobType)) {
    return ['foxs', 'movies', 'feedback', 'pae']
  }
  if (FOXS_JOB_TYPES.includes(jobType)) return ['foxs', 'movies', 'feedback']
  if (jobType === 'sans') return ['movies']
  return []
}

// Only these job types have a resubmit form
const RESUBMIT_ROUTES: Partial<Record<JobType, string>> = {
  pdb: 'classic',
  crd: 'classic',
  auto: 'auto'
}

export const resubmitPathFor = (
  jobType: string,
  id: string
): string | undefined => {
  const route = RESUBMIT_ROUTES[jobType as JobType]
  return route ? `/dashboard/jobs/${route}/resubmit/${id}` : undefined
}

export const resubmitPath = (view: JobView): string | undefined =>
  resubmitPathFor(view.jobType, view.id)

// Scoper runs KGSRNA rather than MD; jobs from before md_engine existed
// were all CHARMM. Multi jobs combine other jobs and have no engine.
export const mdEngineLabel = (view: JobView): string | undefined => {
  if (view.jobType === 'scoper') return 'KGSRNA'
  if (view.jobType === 'multi') return undefined
  return view.md_engine ?? 'CHARMM'
}

// Pale tints in light mode; translucent ones in dark mode so the chip's
// light text stays readable
export const durationBackground = (status: string, theme: Theme) => {
  const dark = theme.palette.mode === 'dark'
  if (status === 'Running' || status === 'Completed') {
    return dark ? alpha(theme.palette.success.main, 0.25) : '#e8f5e9'
  }
  if (status === 'Error' || status === 'Failed') {
    return dark ? alpha(theme.palette.error.main, 0.25) : '#ffebee'
  }
  return undefined
}
