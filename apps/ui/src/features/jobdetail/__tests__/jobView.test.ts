import { describe, it, expect } from 'vitest'
import type { BilboMDJobDTO, PublicJobStatus } from '@bilbomd/bilbomd-types'
import { toJobView, fromPublicJob } from '../jobView'
import { sourceProps } from '../jobSource'

const submitted = new Date('2026-09-29T14:00:00Z')

const ownerDto = {
  id: 'job-1',
  username: 'alice',
  mongo: {
    id: 'job-1',
    jobType: 'auto',
    title: 'My job',
    uuid: 'uuid-1',
    access_mode: 'user',
    status: 'Running',
    progress: 42,
    md_engine: 'OpenMM',
    data_file: 'saxs.dat',
    pdb_file: 'model.pdb',
    rg_min: 20,
    rg_max: 40,
    time_submitted: submitted,
    results_ready: false,
    steps: { md: { status: 'Running', message: 'MD 1/4' } },
    user: { id: 'u1', username: 'alice', email: 'alice@example.com' }
  }
} as unknown as BilboMDJobDTO

const publicJob: PublicJobStatus = {
  publicId: 'tok-1',
  jobId: 'job-1',
  uuid: 'uuid-1',
  jobType: 'auto',
  status: 'Completed',
  progress: 100,
  submittedAt: submitted,
  title: 'My job',
  inputs: { data_file: 'saxs.dat', pdb_file: 'model.pdb' }
}

describe('toJobView', () => {
  it('flattens the owner DTO and keeps owner-only fields', () => {
    const view = toJobView(ownerDto)
    expect(view).toMatchObject({
      id: 'job-1',
      jobType: 'auto',
      title: 'My job',
      status: 'Running',
      progress: 42,
      md_engine: 'OpenMM',
      submittedAt: submitted,
      resultsReady: false,
      accessMode: 'user'
    })
    expect(view.steps?.md?.status).toBe('Running')
  })

  it('copies only whitelisted inputs, never user details', () => {
    const view = toJobView(ownerDto)
    expect(view.inputs).toMatchObject({
      data_file: 'saxs.dat',
      pdb_file: 'model.pdb',
      rg_min: 20,
      rg_max: 40
    })
    expect(JSON.stringify(view.inputs)).not.toContain('alice')
  })

  it('treats a missing or non-numeric progress as 0', () => {
    const dto = {
      ...ownerDto,
      mongo: { ...ownerDto.mongo, progress: undefined }
    } as unknown as BilboMDJobDTO
    expect(toJobView(dto).progress).toBe(0)
  })
})

describe('fromPublicJob', () => {
  it('maps the flat public shape', () => {
    const view = fromPublicJob(publicJob)
    expect(view).toMatchObject({
      id: 'job-1',
      publicId: 'tok-1',
      status: 'Completed',
      progress: 100,
      title: 'My job',
      inputs: { data_file: 'saxs.dat', pdb_file: 'model.pdb' }
    })
    expect(view.resultsReady).toBeUndefined()
  })

  it('tolerates backends that do not send inputs yet', () => {
    const { inputs: _inputs, ...older } = publicJob
    expect(fromPublicJob(older).inputs).toEqual({})
  })
})

describe('sourceProps', () => {
  it('maps a source to the isPublic/publicId component props', () => {
    expect(sourceProps({ kind: 'owner', id: 'job-1' })).toEqual({
      isPublic: false,
      publicId: undefined
    })
    expect(sourceProps({ kind: 'public', token: 'tok-1' })).toEqual({
      isPublic: true,
      publicId: 'tok-1'
    })
  })
})
