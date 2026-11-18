import { describe, it, expect } from 'vitest'
import { RESULTS_SNAPSHOT_FIELDS, resultsJobSnapshot } from '../job-snapshot.js'

// A job record as the worker holds it (fields as seen in real results)
const record = {
  _id: '6afcdabb2daee2c6f8ec23af',
  __t: 'BilboMdPDB',
  title: 'my job',
  uuid: 'ac66cf7c-71f4-4dc6-98bf-6cb2e9d76662',
  md_engine: 'CHARMM',
  status: 'Running',
  progress: 90,
  steps: { md: { status: 'Success', message: '' } },
  time_submitted: '2026-11-17T22:52:00.000Z',
  pdb_file: 'sasdml3.pdb',
  data_file: 'saxs-data.dat',
  const_inp_file: 'const.inp',
  conformational_sampling: 1,
  rg: 35,
  rg_min: 30,
  rg_max: 40,
  md_constraints: { fixed_bodies: [], rigid_bodies: [] },
  charmm_parameters: { md: { nsteps: 300000 } },
  feedback: { overall_chi_square: 1.2 },
  // Who and how to reach the results: must never be in a download
  user: { _id: 'u1', email: 'owner@example.com', username: 'owner' },
  results_token: 'secret-results-token',
  public_id: 'c6d05790-545e-45b2-bca0-3d0769b055b6',
  client_ip_hash: 'a676cb5da0c6293afee07855bae3edf9',
  access_mode: 'anonymous',
  // Internal bookkeeping
  resubmitted_from: 'abc',
  nersc: { jobid: '123', qos: 'regular', state: 'COMPLETED' },
  assets: { movies: [] },
  cleanup_in_progress: false,
  results_ready: true,
  some_future_field: 'not decided yet'
}

describe('resultsJobSnapshot', () => {
  it('keeps the fields that describe the run', () => {
    expect(resultsJobSnapshot(record)).toEqual({
      __t: 'BilboMdPDB',
      title: 'my job',
      uuid: 'ac66cf7c-71f4-4dc6-98bf-6cb2e9d76662',
      md_engine: 'CHARMM',
      status: 'Running',
      progress: 90,
      steps: { md: { status: 'Success', message: '' } },
      time_submitted: '2026-11-17T22:52:00.000Z',
      pdb_file: 'sasdml3.pdb',
      data_file: 'saxs-data.dat',
      const_inp_file: 'const.inp',
      conformational_sampling: 1,
      rg: 35,
      rg_min: 30,
      rg_max: 40,
      md_constraints: { fixed_bodies: [], rigid_bodies: [] },
      charmm_parameters: { md: { nsteps: 300000 } },
      feedback: { overall_chi_square: 1.2 }
    })
  })

  it.each([
    'user',
    'results_token',
    'public_id',
    'client_ip_hash',
    'access_mode',
    '_id',
    'resubmitted_from',
    'nersc',
    'assets',
    'cleanup_in_progress',
    'results_ready',
    'some_future_field'
  ])('leaves out %s', (field) => {
    expect(resultsJobSnapshot(record)).not.toHaveProperty(field)
  })

  it('has no trace of the owner or the results token anywhere', () => {
    const text = JSON.stringify(resultsJobSnapshot(record))
    expect(text).not.toContain('owner@example.com')
    expect(text).not.toContain('secret-results-token')
    expect(text).not.toContain(record.public_id)
    expect(text).not.toContain(record.client_ip_hash)
  })

  it('keeps rg, which ensembles_overlay_plot.py reads', () => {
    expect(RESULTS_SNAPSHOT_FIELDS).toContain('rg')
  })

  it('reads a mongoose document through its toJSON', () => {
    const doc = { toJSON: () => record, user: 'ignored' }
    expect(resultsJobSnapshot(doc)).toHaveProperty('uuid', record.uuid)
    expect(resultsJobSnapshot(doc)).not.toHaveProperty('user')
  })

  it('gives an empty object for anything that is not a record', () => {
    expect(resultsJobSnapshot(null)).toEqual({})
    expect(resultsJobSnapshot('job')).toEqual({})
  })
})
