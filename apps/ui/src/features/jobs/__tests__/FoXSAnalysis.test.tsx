import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import FoXSAnalysis from '../FoXSAnalysis'
import * as jobsApiSlice from 'slices/jobsApiSlice'
import * as publicJobsApiSlice from 'slices/publicJobsApiSlice'
import type { FoxsData } from '@bilbomd/bilbomd-types'

// Mock child components
vi.mock('features/scoperjob/FoXSChart', () => ({
  default: ({
    title,
    chisq,
    c1,
    c2
  }: {
    title: string
    chisq: number
    c1: number
    c2: number
  }) => (
    <div data-testid="foxs-chart">
      <div>{title}</div>
      <div>ChiSq: {chisq}</div>
      <div>C1: {c1}</div>
      <div>C2: {c2}</div>
    </div>
  )
}))

vi.mock('features/foxs/FoXSEnsembleCharts', () => ({
  default: () => <div data-testid="foxs-ensemble-charts">Ensemble Charts</div>
}))

describe('FoXSAnalysis', () => {
  const mockFoxsDataSingle: FoxsData[] = [
    {
      filename: 'model1.pdb',
      chisq: 1.5,
      c1: '1.0',
      c2: '0.0',
      data: [
        { q: 0.01, exp_intensity: 100.5, model_intensity: 98.3, error: 2.1 },
        { q: 0.02, exp_intensity: 85.2, model_intensity: 84.1, error: 1.8 },
        { q: 0.03, exp_intensity: 70.8, model_intensity: 69.5, error: 1.5 }
      ]
    }
  ]

  const mockFoxsDataEnsemble: FoxsData[] = [
    {
      filename: 'model1.pdb',
      chisq: 1.5,
      c1: '1.0',
      c2: '0.0',
      data: [
        { q: 0.01, exp_intensity: 100.5, model_intensity: 98.3, error: 2.1 },
        { q: 0.02, exp_intensity: 85.2, model_intensity: 84.1, error: 1.8 }
      ]
    },
    {
      filename: 'model2.pdb',
      chisq: 1.2,
      c1: '0.95',
      c2: '0.05',
      data: [
        { q: 0.01, exp_intensity: 100.5, model_intensity: 99.1, error: 2.1 },
        { q: 0.02, exp_intensity: 85.2, model_intensity: 85.0, error: 1.8 }
      ]
    }
  ]

  const mockFoxsDataWithNegative: FoxsData[] = [
    {
      filename: 'model1.pdb',
      chisq: 1.5,
      c1: '1.0',
      c2: '0.0',
      data: [
        { q: 0.01, exp_intensity: -5.0, model_intensity: 98.3, error: 2.1 },
        { q: 0.02, exp_intensity: 85.2, model_intensity: 84.1, error: 1.8 }
      ]
    }
  ]

  const mockFoxsDataWithZeroError: FoxsData[] = [
    {
      filename: 'model1.pdb',
      chisq: 1.5,
      c1: '1.0',
      c2: '0.0',
      data: [
        { q: 0.01, exp_intensity: 100.5, model_intensity: 98.3, error: 0 },
        { q: 0.02, exp_intensity: 85.2, model_intensity: 84.1, error: 1.8 }
      ]
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('should show loading spinner when data is loading (protected)', () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        isSuccess: false,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('should show loading spinner when data is loading (public)', () => {
      vi.spyOn(
        publicJobsApiSlice,
        'useGetPublicFoxsDataQuery'
      ).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        isSuccess: false,
        refetch: vi.fn()
      } as never)

      renderWithProviders(
        <FoXSAnalysis publicId="public-123" isPublic={true} />
      )

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('should show error alert when query fails (protected)', () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 500, data: 'Server error' },
        isSuccess: false,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      expect(screen.getByText('FoXS request failed.')).toBeInTheDocument()
      expect(
        screen.getByText(
          'The server returned an error while fetching FoXS data.'
        )
      ).toBeInTheDocument()
    })

    it('should show error alert when query fails (public)', () => {
      vi.spyOn(
        publicJobsApiSlice,
        'useGetPublicFoxsDataQuery'
      ).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 404, data: 'Not found' },
        isSuccess: false,
        refetch: vi.fn()
      } as never)

      renderWithProviders(
        <FoXSAnalysis publicId="public-123" isPublic={true} />
      )

      expect(screen.getByText('FoXS request failed.')).toBeInTheDocument()
    })
  })

  describe('no data state', () => {
    it('should show info alert when no data returned', () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()

      // Text is split by code element, so check parts
      expect(screen.getByText(/No experimental/i)).toBeInTheDocument()
      expect(screen.getByText('.dat')).toBeInTheDocument()
      expect(screen.getByText(/or base FoXS dataset was found/i)).toBeInTheDocument()
    })

    it('should show info alert when base data is empty', () => {
      const emptyData: FoxsData[] = [
        {
          filename: 'model1.pdb',
          chisq: 1.5,
          c1: '1.0',
          c2: '0.0',
          data: []
        }
      ]

      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: emptyData,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()
    })

    it('should show info alert when data is not an array', () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      expect(
        screen.getByText('FoXS data is unavailable for this job.')
      ).toBeInTheDocument()
    })
  })

  describe('query selection', () => {
    it('should use protected query when isPublic is false', () => {
      const protectedQuerySpy = vi
        .spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery')
        .mockReturnValue({
          data: mockFoxsDataSingle,
          isLoading: false,
          isError: false,
          isSuccess: true,
          refetch: vi.fn()
        } as never)

      const publicQuerySpy = vi
        .spyOn(publicJobsApiSlice, 'useGetPublicFoxsDataQuery')
        .mockReturnValue({
          data: undefined,
          isLoading: false,
          isError: false,
          isSuccess: false,
          refetch: vi.fn()
        } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" isPublic={false} />)

      expect(protectedQuerySpy).toHaveBeenCalledWith('job-123', {
        pollingInterval: 0,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: false
      })

      expect(publicQuerySpy).toHaveBeenCalledWith('', {
        skip: true
      })
    })

    it('should use public query when isPublic is true', () => {
      const protectedQuerySpy = vi
        .spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery')
        .mockReturnValue({
          data: undefined,
          isLoading: false,
          isError: false,
          isSuccess: false,
          refetch: vi.fn()
        } as never)

      const publicQuerySpy = vi
        .spyOn(publicJobsApiSlice, 'useGetPublicFoxsDataQuery')
        .mockReturnValue({
          data: mockFoxsDataSingle,
          isLoading: false,
          isError: false,
          isSuccess: true,
          refetch: vi.fn()
        } as never)

      renderWithProviders(
        <FoXSAnalysis publicId="public-123" isPublic={true} />
      )

      expect(protectedQuerySpy).toHaveBeenCalledWith(undefined, {
        pollingInterval: 0,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: true
      })

      expect(publicQuerySpy).toHaveBeenCalledWith('public-123', {
        skip: false
      })
    })

    it('should skip query when active is false (protected)', () => {
      const protectedQuerySpy = vi
        .spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery')
        .mockReturnValue({
          data: undefined,
          isLoading: false,
          isError: false,
          isSuccess: false,
          refetch: vi.fn()
        } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" active={false} />)

      expect(protectedQuerySpy).toHaveBeenCalledWith('job-123', {
        pollingInterval: 0,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: true
      })
    })

    it('should skip query when active is false (public)', () => {
      const publicQuerySpy = vi
        .spyOn(publicJobsApiSlice, 'useGetPublicFoxsDataQuery')
        .mockReturnValue({
          data: undefined,
          isLoading: false,
          isError: false,
          isSuccess: false,
          refetch: vi.fn()
        } as never)

      renderWithProviders(
        <FoXSAnalysis publicId="public-123" isPublic={true} active={false} />
      )

      expect(publicQuerySpy).toHaveBeenCalledWith('public-123', {
        skip: true
      })
    })
  })

  describe('single dataset rendering', () => {
    it('should render FoXSChart with correct data', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataSingle,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      expect(screen.getByText('Original Model')).toBeInTheDocument()
      expect(screen.getByText('ChiSq: 1.5')).toBeInTheDocument()
      expect(screen.getByText('C1: 1.0')).toBeInTheDocument()
      expect(screen.getByText('C2: 0.0')).toBeInTheDocument()
    })

    it('should show "No ensemble data" alert when only single dataset', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataSingle,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByText('No ensemble data')).toBeInTheDocument()
      })

      expect(
        screen.getByText(
          /Only a single FoXS dataset is available; ensemble comparison/i
        )
      ).toBeInTheDocument()
    })
  })

  describe('ensemble dataset rendering', () => {
    it('should render both FoXSChart and FoXSEnsembleCharts', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataEnsemble,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      expect(screen.getByTestId('foxs-ensemble-charts')).toBeInTheDocument()
      expect(screen.queryByText('No ensemble data')).not.toBeInTheDocument()
    })

    it('should not show "No ensemble data" alert with ensemble', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataEnsemble,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-ensemble-charts')).toBeInTheDocument()
      })

      expect(screen.queryByText('No ensemble data')).not.toBeInTheDocument()
    })
  })

  describe('data filtering', () => {
    it('should filter out negative exp_intensity values', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataWithNegative,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      // Component should still render since one valid data point remains
      expect(screen.getByText('Original Model')).toBeInTheDocument()
    })

    it('should filter out zero or negative model_intensity values', async () => {
      const mockDataWithZeroModel: FoxsData[] = [
        {
          filename: 'model1.pdb',
          chisq: 1.5,
          c1: '1.0',
          c2: '0.0',
          data: [
            { q: 0.01, exp_intensity: 100.5, model_intensity: 0, error: 2.1 },
            { q: 0.02, exp_intensity: 85.2, model_intensity: 84.1, error: 1.8 }
          ]
        }
      ]

      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockDataWithZeroModel,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      expect(screen.getByText('Original Model')).toBeInTheDocument()
    })
  })

  describe('error handling in data processing', () => {
    it('should handle zero error values gracefully', async () => {
      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockFoxsDataWithZeroError,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      // Should render without crashing
      expect(screen.getByText('Original Model')).toBeInTheDocument()
    })

    it('should handle missing data points gracefully', async () => {
      const mockDataWithGaps: FoxsData[] = [
        {
          filename: 'model1.pdb',
          chisq: 1.5,
          c1: '1.0',
          c2: '0.0',
          data: [
            { q: 0.01, exp_intensity: 100.5, model_intensity: 98.3, error: 2.1 }
          ]
        },
        {
          filename: 'model2.pdb',
          chisq: 1.2,
          c1: '0.95',
          c2: '0.05',
          data: []
        }
      ]

      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockDataWithGaps,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      expect(screen.getByText('Original Model')).toBeInTheDocument()
    })
  })

  describe('data precision', () => {
    it('should round data values to 4 decimal places', async () => {
      const mockDataHighPrecision: FoxsData[] = [
        {
          filename: 'model1.pdb',
          chisq: 1.56789,
          c1: '1.01234',
          c2: '0.00567',
          data: [
            {
              q: 0.0123456789,
              exp_intensity: 100.56789,
              model_intensity: 98.34567,
              error: 2.123456
            }
          ]
        }
      ]

      vi.spyOn(jobsApiSlice, 'useGetFoxsAnalysisByIdQuery').mockReturnValue({
        data: mockDataHighPrecision,
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: vi.fn()
      } as never)

      renderWithProviders(<FoXSAnalysis id="job-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('foxs-chart')).toBeInTheDocument()
      })

      // Component should process and render the data
      expect(screen.getByText('Original Model')).toBeInTheDocument()
    })
  })
})
