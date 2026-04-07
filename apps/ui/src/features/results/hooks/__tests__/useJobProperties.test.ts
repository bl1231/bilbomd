import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { useJobProperties } from '../useJobProperties'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'

// Mock the job handler factory
vi.mock('../../handlers/jobHandlerFactory', () => ({
  createJobHandler: vi.fn((jobType) => {
    if (jobType === 'unknown') {
      throw new Error(`Unknown job type: ${jobType}`)
    }
    return {
      getJobSpecificProperties: vi.fn(() => [
        { label: 'Test Property', value: 'Test Value' }
      ]),
      getJobTypeDisplayName: vi.fn(() => 'Test Job Type')
    }
  })
}))

// Mock the MDConstraintsRenderer component
vi.mock('../../components/MDConstraintsRenderer', () => ({
  MDConstraintsRenderer: () => null
}))

const createMockJob = <T extends BilboMDJobDTO['mongo']>(
  overrides: Partial<T> = {} as Partial<T>
): BilboMDJobDTO => ({
  id: 'test-job-1',
  username: 'testuser',
  mongo: {
    id: 'mongo-id-1',
    jobType: 'auto',
    title: 'Test Job',
    uuid: 'test-uuid',
    access_mode: 'user',
    status: 'Completed',
    data_file: 'test.dat',
    md_engine: 'CHARMM',
    time_submitted: new Date('2023-01-01T10:00:00Z'),
    ...overrides
  } as T
})

describe('useJobProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Date.now() for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return base properties for a job', () => {
    const job = createMockJob()
    const { result } = renderHook(() => useJobProperties(job))

    const properties = result.current
    const propertyLabels = properties.map((p) => p.label)

    expect(propertyLabels).toContain('MongoDB ID')
    expect(propertyLabels).toContain('Pipeline')
    expect(propertyLabels).toContain('MD Engine')
    expect(propertyLabels).toContain('Submitted')
    expect(propertyLabels).toContain('SAXS Data')
  })

  it('should include started time and duration when job has started', () => {
    const job = createMockJob({
      time_started: new Date('2023-01-01T10:30:00Z'),
      time_completed: new Date('2023-01-01T11:30:00Z')
    })

    const { result } = renderHook(() => useJobProperties(job))
    const properties = result.current
    const propertyLabels = properties.map((p) => p.label)

    expect(propertyLabels).toContain('Started')
    expect(propertyLabels).toContain('Duration')

    const durationProp = properties.find((p) => p.label === 'Duration')
    expect(durationProp?.value).toBe('1h 0m 0s')
  })

  it('should format duration correctly for different time spans', () => {
    const testCases = [
      {
        start: '2023-01-01T10:00:00Z',
        end: '2023-01-01T10:00:30Z',
        expected: '30s'
      },
      {
        start: '2023-01-01T10:00:00Z',
        end: '2023-01-01T10:05:30Z',
        expected: '5m 30s'
      },
      {
        start: '2023-01-01T10:00:00Z',
        end: '2023-01-01T12:30:45Z',
        expected: '2h 30m 45s'
      }
    ]

    testCases.forEach(({ start, end, expected }) => {
      const job = createMockJob({
        time_started: new Date(start),
        time_completed: new Date(end)
      })

      const { result } = renderHook(() => useJobProperties(job))
      const properties = result.current
      const durationProp = properties.find((p) => p.label === 'Duration')

      expect(durationProp?.value).toBe(expected)
    })
  })

  it('should update duration for running jobs', () => {
    const job = createMockJob({
      status: 'Running',
      time_started: new Date('2023-01-01T11:58:00Z') // 2 minutes ago
    })

    const { result } = renderHook(() => useJobProperties(job))

    // Initial duration
    let properties = result.current
    let durationProp = properties.find((p) => p.label === 'Duration')
    expect(durationProp?.value).toBe('2m 0s')

    // Advance time by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000)
    })

    properties = result.current
    durationProp = properties.find((p) => p.label === 'Duration')
    expect(durationProp?.value).toBe('2m 30s')
  })

  it('should map job types to display names correctly', () => {
    const jobTypeMapping = {
      pdb: 'BilboMD Classic w/PDB',
      auto: 'BilboMD Auto',
      alphafold: 'BilboMD AlphaFold',
      sans: 'BilboMD SANS',
      crd: 'BilboMD Classic w/CRD/PSF',
      scoper: 'BilboMD Scoper',
      multi: 'BilboMD MultiMD'
    } as const

    Object.entries(jobTypeMapping).forEach(([jobType, expectedDisplayName]) => {
      const job = createMockJob({
        jobType: jobType as keyof typeof jobTypeMapping
      })
      const { result } = renderHook(() => useJobProperties(job))

      const properties = result.current
      const pipelineProp = properties.find((p) => p.label === 'Pipeline')
      expect(pipelineProp?.value).toBe(expectedDisplayName)
    })
  })

  it('should handle unknown job type by throwing error', () => {
    const job = createMockJob({
      jobType: 'unknown' as unknown as BilboMDJobDTO['mongo']['jobType']
    })

    expect(() => {
      renderHook(() => useJobProperties(job))
    }).toThrow('Unknown job type: unknown')
  })

  it('should include MD constraints when present', () => {
    const job = createMockJob({
      md_constraints: {
        fixed_bodies: [
          {
            name: 'Fixed Body 1',
            segments: [
              {
                chain_id: 'A',
                residues: { start: 1, stop: 10 }
              }
            ]
          }
        ],
        rigid_bodies: []
      }
    })

    const { result } = renderHook(() => useJobProperties(job))
    const properties = result.current
    const propertyLabels = properties.map((p) => p.label)

    expect(propertyLabels).toContain('MD Constraints')

    const constraintProp = properties.find((p) => p.label === 'MD Constraints')
    expect(constraintProp?.render).toBeDefined()
  })

  it('should not include MD constraints when not present', () => {
    const job = createMockJob() // No md_constraints
    const { result } = renderHook(() => useJobProperties(job))

    const properties = result.current
    const propertyLabels = properties.map((p) => p.label)

    expect(propertyLabels).not.toContain('MD Constraints')
  })

  it('should include job-specific properties from handler', () => {
    const job = createMockJob()
    const { result } = renderHook(() => useJobProperties(job))

    const properties = result.current
    const testProperty = properties.find((p) => p.label === 'Test Property')

    expect(testProperty).toBeDefined()
    expect(testProperty?.value).toBe('Test Value')
  })

  it('should default MD engine to CHARMM when not specified', () => {
    const job = createMockJob({ md_engine: undefined })
    const { result } = renderHook(() => useJobProperties(job))

    const properties = result.current
    const engineProp = properties.find((p) => p.label === 'MD Engine')
    expect(engineProp?.value).toBe('CHARMM')
  })
})
