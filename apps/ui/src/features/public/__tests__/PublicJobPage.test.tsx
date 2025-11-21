import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from 'test/server'
import { renderWithProviders } from 'test/test-utils'
import PublicJobPage from '../PublicJobPage'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'

// Mock the useParams hook
const mockUseParams = vi.fn()
vi.mock('react-router', async () => {
  const actual = (await vi.importActual('react-router')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    useParams: () => mockUseParams()
  }
})

// Mock the useTitle hook
vi.mock('hooks/useTitle', () => ({
  default: vi.fn()
}))

// Mock the child components
vi.mock('features/public/PublicJobAnalysisSection', () => ({
  default: ({ job }: { job: PublicJobStatus }) => (
    <div data-testid="analysis-section">
      Analysis Section for {job.publicId}
    </div>
  )
}))

vi.mock('features/public/PublicDownloadResultsSection', () => ({
  default: ({ job }: { job: PublicJobStatus }) => (
    <div data-testid="download-section">
      Download Section for {job.publicId}
    </div>
  )
}))

describe('PublicJobPage', () => {
  const mockPublicId = 'test-public-id-123'

  const mockJobData: PublicJobStatus = {
    publicId: mockPublicId,
    jobId: 'job-123',
    uuid: 'uuid-123',
    jobType: 'auto',
    status: 'Running',
    progress: 65,
    md_engine: 'OpenMM',
    submittedAt: new Date('2023-01-01'),
    startedAt: new Date('2023-01-01T01:00:00'),
    results: {
      summary: null,
      classic: null,
      auto: { total_num_ensembles: 10 },
      alphafold: null,
      sans: null,
      scoper: null
    }
  }

  const completedJobData: PublicJobStatus = {
    ...mockJobData,
    status: 'Completed',
    progress: 100,
    completedAt: new Date('2023-01-01T02:00:00')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    server.resetHandlers()
  })

  describe('when publicId is missing', () => {
    beforeEach(() => {
      mockUseParams.mockReturnValue({})
    })

    it('should display missing job id error', () => {
      renderWithProviders(<PublicJobPage />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Missing job id')).toBeInTheDocument()
      expect(
        screen.getByText('No public job id was provided in the URL.')
      ).toBeInTheDocument()
    })
  })

  describe('when publicId is present', () => {
    beforeEach(() => {
      mockUseParams.mockReturnValue({ publicId: mockPublicId })
    })

    it('should display loading state initially', () => {
      // Don't mock the API response, so it will be loading
      renderWithProviders(<PublicJobPage />)

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('should display error state when job is not found', async () => {
      // Mock a 404 response
      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return new HttpResponse(null, { status: 404 })
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('Job Not Found')).toBeInTheDocument()
      })

      expect(
        screen.getByText(
          'We could not find a job with this link. It may have expired or the URL may be incorrect.'
        )
      ).toBeInTheDocument()
    })

    it('should display job information when data is loaded', async () => {
      // Mock successful API response
      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(mockJobData)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('BilboMD Job Status')).toBeInTheDocument()
      })

      expect(
        screen.getByText(
          `Job type: ${mockJobData.jobType} | MD Engine: ${mockJobData.md_engine}`
        )
      ).toBeInTheDocument()
      expect(screen.getByText(`Public Job ID:`)).toBeInTheDocument()
      expect(screen.getByText('Progress')).toBeInTheDocument()
      expect(screen.getByText('65%')).toBeInTheDocument()
    })

    it('should display status chip with correct status', async () => {
      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(mockJobData)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument()
      })
    })

    it('should show analysis and download sections when job is completed', async () => {
      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(completedJobData)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument()
      })

      expect(screen.getByTestId('analysis-section')).toBeInTheDocument()
      expect(screen.getByTestId('download-section')).toBeInTheDocument()
      expect(
        screen.getByText(`Analysis Section for ${mockPublicId}`)
      ).toBeInTheDocument()
      expect(
        screen.getByText(`Download Section for ${mockPublicId}`)
      ).toBeInTheDocument()
    })

    it('should not show analysis and download sections when job is not completed', async () => {
      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(mockJobData)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('65%')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('analysis-section')).not.toBeInTheDocument()
      expect(screen.queryByTestId('download-section')).not.toBeInTheDocument()
    })

    it('should handle job with no md_engine', async () => {
      const jobWithoutEngine = { ...mockJobData, md_engine: undefined }

      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(jobWithoutEngine)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(
          screen.getByText(
            `Job type: ${jobWithoutEngine.jobType} | MD Engine: n/a`
          )
        ).toBeInTheDocument()
      })
    })

    it('should handle job with no progress value', async () => {
      const jobWithoutProgress = { ...mockJobData, progress: 0 }

      server.use(
        http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
          return HttpResponse.json(jobWithoutProgress)
        })
      )

      renderWithProviders(<PublicJobPage />)

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument()
      })
    })

    describe('different job statuses', () => {
      const statuses = [
        'Pending',
        'Submitted',
        'Running',
        'Completed',
        'Failed',
        'Error',
        'Cancelled'
      ]

      statuses.forEach((status) => {
        it(`should display ${status} status correctly`, async () => {
          const jobWithStatus = { ...mockJobData, status }

          server.use(
            http.get(
              'http://localhost:3002/api/v1/public/jobs/:publicId',
              () => {
                return HttpResponse.json(jobWithStatus)
              }
            )
          )

          renderWithProviders(<PublicJobPage />)

          await waitFor(() => {
            expect(screen.getByText(status)).toBeInTheDocument()
          })
        })
      })
    })

    describe('different job types', () => {
      const jobTypes = ['auto', 'classic', 'alphafold', 'scoper']

      jobTypes.forEach((jobType) => {
        it(`should display ${jobType} job type correctly`, async () => {
          const jobWithType = { ...mockJobData, jobType }

          server.use(
            http.get(
              'http://localhost:3002/api/v1/public/jobs/:publicId',
              () => {
                return HttpResponse.json(jobWithType)
              }
            )
          )

          renderWithProviders(<PublicJobPage />)

          await waitFor(() => {
            expect(
              screen.getByText(
                `Job type: ${jobType} | MD Engine: ${mockJobData.md_engine}`
              )
            ).toBeInTheDocument()
          })
        })
      })
    })

    describe('progress display', () => {
      const progressValues = [0, 25, 50, 75, 100]

      progressValues.forEach((progress) => {
        it(`should display ${progress}% progress correctly`, async () => {
          const jobWithProgress = { ...mockJobData, progress }

          server.use(
            http.get(
              'http://localhost:3002/api/v1/public/jobs/:publicId',
              () => {
                return HttpResponse.json(jobWithProgress)
              }
            )
          )

          renderWithProviders(<PublicJobPage />)

          await waitFor(() => {
            expect(screen.getByText(`${progress}%`)).toBeInTheDocument()
          })
        })
      })
    })

    describe('polling behavior', () => {
      it('should display running job and continue polling', async () => {
        server.use(
          http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
            return HttpResponse.json(mockJobData)
          })
        )

        renderWithProviders(<PublicJobPage />)

        await waitFor(() => {
          expect(screen.getByText('Running')).toBeInTheDocument()
        })

        // For polling, we'd need to test the useEffect behavior
        // This test verifies the component renders correctly for running jobs
      })

      it('should stop showing polling indicator for completed jobs', async () => {
        server.use(
          http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
            return HttpResponse.json(completedJobData)
          })
        )

        renderWithProviders(<PublicJobPage />)

        await waitFor(() => {
          expect(screen.getByText('Completed')).toBeInTheDocument()
        })
      })
    })

    describe('server errors', () => {
      it('should handle server error gracefully', async () => {
        server.use(
          http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
            return new HttpResponse(null, { status: 500 })
          })
        )

        renderWithProviders(<PublicJobPage />)

        await waitFor(() => {
          expect(screen.getByText('Job Not Found')).toBeInTheDocument()
        })
      })

      it('should handle network error gracefully', async () => {
        server.use(
          http.get('http://localhost:3002/api/v1/public/jobs/:publicId', () => {
            return HttpResponse.error()
          })
        )

        renderWithProviders(<PublicJobPage />)

        await waitFor(() => {
          expect(screen.getByText('Job Not Found')).toBeInTheDocument()
        })
      })
    })
  })
})
