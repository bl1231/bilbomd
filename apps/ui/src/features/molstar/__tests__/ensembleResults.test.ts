import { describe, it, expect } from 'vitest'
import type { IEnsemble, JobResultsDTO } from '@bilbomd/bilbomd-types'
import {
  ensembleResultsKeys,
  getEnsemblesForJob,
  mayHaveStartingModel
} from '../ensembleResults'

const ensembles = [
  { size: 1, models: [] },
  { size: 2, models: [] }
] as unknown as IEnsemble[]

const resultsWith = (key: string): JobResultsDTO =>
  ({ [key]: { total_num_ensembles: 2, ensembles } }) as unknown as JobResultsDTO

describe('getEnsemblesForJob', () => {
  it('reads each job type from its own results key', () => {
    expect(getEnsemblesForJob('pdb', resultsWith('classic'))).toBe(ensembles)
    expect(getEnsemblesForJob('crd', resultsWith('classic'))).toBe(ensembles)
    expect(getEnsemblesForJob('auto', resultsWith('auto'))).toBe(ensembles)
    expect(getEnsemblesForJob('openfold', resultsWith('openfold'))).toBe(
      ensembles
    )
    expect(getEnsemblesForJob('bioemu', resultsWith('bioemu'))).toBe(ensembles)
  })

  it('does not read another pipeline’s results', () => {
    expect(getEnsemblesForJob('bioemu', resultsWith('openfold'))).toEqual([])
  })

  it('returns nothing for job types without ensembles or missing results', () => {
    expect(getEnsemblesForJob('scoper', resultsWith('scoper'))).toEqual([])
    expect(getEnsemblesForJob('multi', resultsWith('classic'))).toEqual([])
    expect(
      getEnsemblesForJob('bioemu', { bioemu: null } as unknown as JobResultsDTO)
    ).toEqual([])
    expect(
      getEnsemblesForJob('bioemu', {
        bioemu: {}
      } as unknown as JobResultsDTO)
    ).toEqual([])
  })
})

describe('mayHaveStartingModel', () => {
  it('is true for pipelines that minimize an input model', () => {
    for (const jobType of ['pdb', 'crd', 'auto', 'alphafold', 'openfold']) {
      expect(
        mayHaveStartingModel(jobType as keyof typeof ensembleResultsKeys)
      ).toBe(true)
    }
  })

  it('is false for BioEmu2, which has no input model, and for non-ensemble jobs', () => {
    expect(mayHaveStartingModel('bioemu')).toBe(false)
    expect(mayHaveStartingModel('scoper')).toBe(false)
    expect(mayHaveStartingModel('multi')).toBe(false)
  })
})
