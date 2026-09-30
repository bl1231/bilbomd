import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { JobView } from 'features/jobdetail/jobView'
import { useJobProperties } from '../useJobProperties'

const getJobSpecificProperties = vi.fn(() => [
  { label: 'Test Property', value: 'Test Value' }
])

vi.mock('../../handlers/jobHandlerFactory', () => ({
  createJobHandler: vi.fn(() => ({
    getJobSpecificProperties,
    getJobTypeDisplayName: () => 'Test Job Type'
  }))
}))

vi.mock('../../components/MDConstraintsRenderer', () => ({
  MDConstraintsRenderer: () => null
}))

const makeView = (overrides: Partial<JobView> = {}): JobView => ({
  id: 'job-1',
  jobType: 'auto',
  uuid: 'uuid-1',
  status: 'Completed',
  progress: 100,
  submittedAt: new Date('2023-01-01'),
  inputs: { data_file: 'test.dat' },
  ...overrides
})

describe('useJobProperties', () => {
  it('lists the SAXS data file then the job-specific properties', () => {
    const { result } = renderHook(() => useJobProperties(makeView()))
    expect(result.current).toEqual([
      { label: 'SAXS Data', value: 'test.dat' },
      { label: 'Test Property', value: 'Test Value' }
    ])
  })

  it('passes the view and modal opener to the job handler', () => {
    const view = makeView()
    const onOpenModal = vi.fn()
    renderHook(() => useJobProperties(view, onOpenModal))
    expect(getJobSpecificProperties).toHaveBeenCalledWith(view, onOpenModal)
  })

  it('no longer includes ids, engine or timings', () => {
    const { result } = renderHook(() => useJobProperties(makeView()))
    const labels = result.current.map((p) => p.label)
    for (const label of ['MongoDB ID', 'Pipeline', 'MD Engine', 'Duration']) {
      expect(labels).not.toContain(label)
    }
  })

  it('adds MD constraints when the job has any', () => {
    const { result } = renderHook(() =>
      useJobProperties(
        makeView({
          md_constraints: {
            fixed_bodies: [{ name: 'fb1', segments: [] }]
          }
        })
      )
    )
    const constraints = result.current.find((p) => p.label === 'MD Constraints')
    expect(constraints?.render).toBeDefined()
  })

  it('skips empty MD constraints', () => {
    const { result } = renderHook(() =>
      useJobProperties(makeView({ md_constraints: {} }))
    )
    expect(result.current.map((p) => p.label)).not.toContain('MD Constraints')
  })
})
