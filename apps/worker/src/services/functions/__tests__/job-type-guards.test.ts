import { describe, it, expect } from 'vitest'
import type { IJob } from '@bilbomd/mongodb-schema'
import {
  isBilboMDCRDJob,
  isBilboMDPDBJob,
  isBilboMDAutoJob,
  isBilboMDAlphaFoldJob,
  isBilboMDOpenFoldJob,
  isBilboMDSANSJob
} from '../job-type-guards.js'

const job = (fields: object) => fields as unknown as IJob

describe('job type guards', () => {
  it.each([
    [isBilboMDCRDJob, 'crd_file'],
    [isBilboMDPDBJob, 'pdb_file'],
    [isBilboMDAutoJob, 'pae_file'],
    [isBilboMDAlphaFoldJob, 'alphafold_entities'],
    [isBilboMDOpenFoldJob, 'openfold_entities'],
    [isBilboMDSANSJob, 'd2o_fraction']
  ])('%o matches jobs that have %s', (guard, field) => {
    expect(guard(job({ [field]: 0 }))).toBe(true)
    expect(guard(job({ uuid: 'u' }))).toBe(false)
  })
})
