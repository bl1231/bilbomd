// apps/ui/src/features/scoperjob/__tests__/ScoperFoXSAnalysis.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import ScoperFoXSAnalysis from '../ScoperFoXSAnalysis'
import * as jobsApiSlice from 'slices/jobsApiSlice'

// Mock FoXSChart — expose minYAxis and maxYAxis so tests can assert on them
vi.mock('features/scoperjob/FoXSChart', () => ({
  default: ({
    title,
    chisq,
    c1,
    c2,
    minYAxis,
    maxYAxis
  }: {
    title: string
    chisq: number
    c1: string
    c2: string
    minYAxis: number
    maxYAxis: number
  }) => (
    <div data-testid="foxs-chart">
      <div>{title}</div>
      <div>ChiSq: {chisq}</div>
      <div>C1: {c1}</div>
      <div>C2: {c2}</div>
      <div data-testid="min-y-axis">{minYAxis}</div>
      <div data-testid="max-y-axis">{maxYAxis}</div>
    </div>
  )
}))

// ---------------------------------------------------------------------------
// Data fixtures
// ---------------------------------------------------------------------------

const validTwoDatasets = [
  {
    filename: 'original.pdb',
    chisq: 1.5,
    c1: '1.01',
    c2: '0.02',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 98.0, error: 2.0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.0, error: 1.5 }
    ]
  },
  {
    filename: 'scoper.pdb',
    chisq: 1.2,
    c1: '0.98',
    c2: '0.01',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 99.0, error: 2.0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.5, error: 1.5 }
    ]
  }
]

// foxsData[0].data has a point where error = 0 AND exp_intensity ===
// model_intensity — numerator is 0, so 0/0 = NaN before the fix.
const zeroErrorEqualIntensities = [
  {
    filename: 'original.pdb',
    chisq: 1.5,
    c1: '1.01',
    c2: '0.02',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 100.0, error: 0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.0, error: 1.5 }
    ]
  },
  {
    filename: 'scoper.pdb',
    chisq: 1.2,
    c1: '0.98',
    c2: '0.01',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 99.0, error: 2.0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.5, error: 1.5 }
    ]
  }
]

// foxsData[0].data has a point where error = 0 AND exp_intensity !==
// model_intensity — numerator non-zero, so n/0 = Infinity before the fix.
const zeroErrorDifferentIntensities = [
  {
    filename: 'original.pdb',
    chisq: 1.5,
    c1: '1.01',
    c2: '0.02',
    data: [
      { q: 0.01, exp_intensity: 200.0, model_intensity: 100.0, error: 0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.0, error: 1.5 }
    ]
  },
  {
    filename: 'scoper.pdb',
    chisq: 1.2,
    c1: '0.98',
    c2: '0.01',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 99.0, error: 2.0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.5, error: 1.5 }
    ]
  }
]

// All points in foxsData[0].data have exp_intensity <= 0, so prepData filters
// them all out.  Before the fix, Math.max() of an empty array returned
// -Infinity and the domain became [Infinity, -Infinity].
const allPointsFilteredOut = [
  {
    filename: 'original.pdb',
    chisq: 1.5,
    c1: '1.01',
    c2: '0.02',
    data: [
      { q: 0.01, exp_intensity: -10.0, model_intensity: 98.0, error: 2.0 },
      { q: 0.02, exp_intensity: 0.0, model_intensity: 84.0, error: 1.5 }
    ]
  },
  {
    filename: 'scoper.pdb',
    chisq: 1.2,
    c1: '0.98',
    c2: '0.01',
    data: [
      { q: 0.01, exp_intensity: 100.0, model_intensity: 99.0, error: 2.0 },
      { q: 0.02, exp_intensity: 85.0, model_intensity: 84.5, error: 1.5 }
    ]
  }
]

// ---------------------------------------------------------------------------
// Helper that sets up the query spy and returns it
// ---------------------------------------------------------------------------

const mockQuery = (overrides: {
  data?: unknown
  isLoading?: boolean
  isError?: boolean
}) =>
  vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
    data: overrides.data ?? undefined,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
    isSuccess: !overrides.isLoading && !overrides.isError,
    refetch: vi.fn()
  } as never)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScoperFoXSAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('shows "Loading..." while the query is in flight', () => {
      mockQuery({ data: undefined, isLoading: true })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.queryByTestId('foxs-chart')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // 2. No-data / error state
  // -------------------------------------------------------------------------

  describe('error / no-data state', () => {
    it('shows the unavailability alert when isError is true', () => {
      mockQuery({ data: undefined, isError: true })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()
      expect(screen.queryByTestId('foxs-chart')).not.toBeInTheDocument()
    })

    it('shows the unavailability alert when data is falsy', () => {
      mockQuery({ data: null })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()
    })

    it('shows the unavailability alert when data is undefined', () => {
      mockQuery({ data: undefined })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // 3. Normal render with 2 datasets
  // -------------------------------------------------------------------------

  describe('normal render with two datasets', () => {
    it('renders two FoXSChart elements', async () => {
      mockQuery({ data: validTwoDatasets })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        const charts = screen.getAllByTestId('foxs-chart')
        expect(charts).toHaveLength(2)
      })
    })

    it('includes the original filename in the first chart title', async () => {
      mockQuery({ data: validTwoDatasets })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(
          screen.getByText('Original Model - original.pdb')
        ).toBeInTheDocument()
      })
    })

    it('includes the scoper filename in the second chart title', async () => {
      mockQuery({ data: validTwoDatasets })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(
          screen.getByText('Scoper Model - scoper.pdb')
        ).toBeInTheDocument()
      })
    })

    it('passes correct ChiSq, C1, C2 values for the original chart', async () => {
      mockQuery({ data: validTwoDatasets })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getByText('ChiSq: 1.5')).toBeInTheDocument()
        expect(screen.getByText('C1: 1.01')).toBeInTheDocument()
        expect(screen.getByText('C2: 0.02')).toBeInTheDocument()
      })
    })

    it('passes correct ChiSq, C1, C2 values for the scoper chart', async () => {
      mockQuery({ data: validTwoDatasets })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getByText('ChiSq: 1.2')).toBeInTheDocument()
        expect(screen.getByText('C1: 0.98')).toBeInTheDocument()
        expect(screen.getByText('C2: 0.01')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // 4. Zero error + equal intensities — 0/0 = NaN before the fix
  // -------------------------------------------------------------------------

  describe('NaN guard: zero error with equal intensities', () => {
    it('renders without crashing', async () => {
      mockQuery({ data: zeroErrorEqualIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        const charts = screen.getAllByTestId('foxs-chart')
        expect(charts).toHaveLength(2)
      })
    })

    it('produces a finite minYAxis value (not NaN)', async () => {
      mockQuery({ data: zeroErrorEqualIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('min-y-axis')).toHaveLength(2)
      })

      const minValues = screen.getAllByTestId('min-y-axis')
      for (const el of minValues) {
        const num = Number(el.textContent)
        expect(Number.isFinite(num)).toBe(true)
      }
    })

    it('produces a finite maxYAxis value (not NaN)', async () => {
      mockQuery({ data: zeroErrorEqualIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('max-y-axis')).toHaveLength(2)
      })

      const maxValues = screen.getAllByTestId('max-y-axis')
      for (const el of maxValues) {
        const num = Number(el.textContent)
        expect(Number.isFinite(num)).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 5. Zero error + differing intensities — n/0 = Infinity before the fix
  // -------------------------------------------------------------------------

  describe('Infinity guard: zero error with differing intensities', () => {
    it('renders without crashing', async () => {
      mockQuery({ data: zeroErrorDifferentIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        const charts = screen.getAllByTestId('foxs-chart')
        expect(charts).toHaveLength(2)
      })
    })

    it('produces a finite minYAxis value (not Infinity)', async () => {
      mockQuery({ data: zeroErrorDifferentIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('min-y-axis')).toHaveLength(2)
      })

      const minValues = screen.getAllByTestId('min-y-axis')
      for (const el of minValues) {
        const num = Number(el.textContent)
        expect(Number.isFinite(num)).toBe(true)
      }
    })

    it('produces a finite maxYAxis value (not Infinity)', async () => {
      mockQuery({ data: zeroErrorDifferentIntensities })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('max-y-axis')).toHaveLength(2)
      })

      const maxValues = screen.getAllByTestId('max-y-axis')
      for (const el of maxValues) {
        const num = Number(el.textContent)
        expect(Number.isFinite(num)).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 6. All data filtered by prepData → fallback Y-axis domain { -1, 1 }
  // -------------------------------------------------------------------------

  describe('empty residuals fallback: all data points filtered out', () => {
    it('renders without crashing when prepData returns an empty array', async () => {
      mockQuery({ data: allPointsFilteredOut })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        const charts = screen.getAllByTestId('foxs-chart')
        expect(charts).toHaveLength(2)
      })
    })

    it('uses the fallback minYAxis of -1', async () => {
      mockQuery({ data: allPointsFilteredOut })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('min-y-axis')).toHaveLength(2)
      })

      const minValues = screen.getAllByTestId('min-y-axis')
      // Both charts receive the same computed minYAxis from the memoized value
      for (const el of minValues) {
        const num = Number(el.textContent)
        expect(num).toBe(-1)
      }
    })

    it('uses the fallback maxYAxis of 1', async () => {
      mockQuery({ data: allPointsFilteredOut })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('max-y-axis')).toHaveLength(2)
      })

      const maxValues = screen.getAllByTestId('max-y-axis')
      for (const el of maxValues) {
        const num = Number(el.textContent)
        expect(num).toBe(1)
      }
    })

    it('produces finite Y-axis bounds (not -Infinity/Infinity)', async () => {
      mockQuery({ data: allPointsFilteredOut })

      renderWithProviders(<ScoperFoXSAnalysis id="job-abc" />)

      await waitFor(() => {
        expect(screen.getAllByTestId('min-y-axis')).toHaveLength(2)
        expect(screen.getAllByTestId('max-y-axis')).toHaveLength(2)
      })

      for (const el of screen.getAllByTestId('min-y-axis')) {
        expect(Number.isFinite(Number(el.textContent))).toBe(true)
      }
      for (const el of screen.getAllByTestId('max-y-axis')) {
        expect(Number.isFinite(Number(el.textContent))).toBe(true)
      }
    })
  })
})
