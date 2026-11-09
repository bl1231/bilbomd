import type { JobType, JobResultsDTO, IEnsemble } from '@bilbomd/bilbomd-types'

interface HasEnsembles {
  ensembles: IEnsemble[]
}

// Job types whose results carry MultiFoXS ensembles, mapped to the key under
// which those ensembles live in JobResultsDTO.
export const ensembleResultsKeys: Partial<
  Record<JobType, keyof JobResultsDTO>
> = {
  pdb: 'classic',
  crd: 'classic',
  auto: 'auto',
  alphafold: 'alphafold',
  openfold: 'openfold',
  bioemu: 'bioemu',
  sans: 'sans'
}

// The ensembles array for a job: the viewer loads one
// ensemble_size_<N>_model.pdb per entry, and the weights panel shows the
// per-conformation weights.
export const getEnsemblesForJob = (
  jobType: JobType,
  results: JobResultsDTO
): IEnsemble[] => {
  const key = ensembleResultsKeys[jobType]
  if (!key) return []
  const jobResults = results?.[key] as HasEnsembles | null | undefined
  return Array.isArray(jobResults?.ensembles) ? jobResults.ensembles : []
}

// Whether results/minimization_output.pdb may exist to compare the ensembles
// with. BioEmu2 samples from sequence: it has no input model to minimize.
export const mayHaveStartingModel = (jobType: JobType): boolean =>
  Boolean(ensembleResultsKeys[jobType]) && jobType !== 'bioemu'
