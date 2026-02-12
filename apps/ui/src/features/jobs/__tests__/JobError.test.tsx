import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from 'test/test-utils'
import { screen, waitFor } from '@testing-library/react'
import JobError from '../JobError'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import { axiosInstance } from 'app/api/axios'

vi.mock('app/api/axios', () => ({
  axiosInstance: {
    get: vi.fn()
  }
}))

describe('JobError', () => {
  const mockJob = {
    id: 'job-123',
    username: 'testuser',
    mongo: {
      id: 'job-123',
      title: 'Test Job',
      jobType: 'pdb',
      uuid: 'test-uuid',
      access_mode: 'user',
      status: 'Error',
      data_file: 'test.dat',
      md_engine: 'CHARMM',
      time_submitted: new Date('2023-12-01T10:00:00Z'),
      progress: 50,
      cleanup_in_progress: false,
      user: {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      },
      steps: {
        pdb2crd: { status: 'Success', message: 'PDB converted' },
        minimize: { status: 'Error', message: 'Minimization failed' },
        md: { status: 'Waiting', message: '' }
      }
    }
  } as BilboMDJobDTO

  const mockLogContent = `Error: Minimization failed
    at step 100
    energy too high
    simulation terminated`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render log content when error exists', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: mockLogContent }
      })

      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        expect(screen.getByText(/Minimization failed/)).toBeInTheDocument()
      })
    })

    it('should render pre element with log content', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: mockLogContent }
      })

      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        const preElement = screen.getByText(/Minimization failed/).closest('pre')
        expect(preElement).toBeInTheDocument()
      })
    })
  })

  describe('error log fetching', () => {
    it('should fetch error log for errored step', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: mockLogContent }
      })

      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith(
          'jobs/job-123/logs?step=minimize',
          expect.objectContaining({
            responseType: 'json',
            headers: {
              Authorization: 'Bearer test-token'
            }
          })
        )
      })
    })

    it('should not fetch log when no error step exists', () => {
      const jobWithoutError = {
        ...mockJob,
        mongo: {
          ...mockJob.mongo,
          steps: {
            pdb2crd: { status: 'Success', message: 'PDB converted' },
            minimize: { status: 'Success', message: 'Minimized' },
            md: { status: 'Running', message: 'In progress' }
          }
        }
      } as BilboMDJobDTO

      renderWithProviders(<JobError job={jobWithoutError} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      expect(axiosInstance.get).not.toHaveBeenCalled()
    })

    it('should handle API errors gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      vi.mocked(axiosInstance.get).mockRejectedValueOnce(
        new Error('Network error')
      )

      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error fetching log file:',
          expect.any(Error)
        )
      })

      consoleErrorSpy.mockRestore()
    })
  })

  describe('step detection', () => {
    it('should find first errored step', async () => {
      const multiErrorJob = {
        ...mockJob,
        mongo: {
          ...mockJob.mongo,
          steps: {
            pdb2crd: { status: 'Success', message: 'Done' },
            minimize: { status: 'Error', message: 'First error' },
            md: { status: 'Error', message: 'Second error' }
          }
        }
      } as BilboMDJobDTO

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: 'First error log' }
      })

      renderWithProviders(<JobError job={multiErrorJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith(
          'jobs/job-123/logs?step=minimize',
          expect.any(Object)
        )
      })
    })

    it('should handle job without steps object', () => {
      const jobWithoutSteps = {
        ...mockJob,
        mongo: {
          ...mockJob.mongo,
          steps: undefined
        }
      } as BilboMDJobDTO

      renderWithProviders(<JobError job={jobWithoutSteps} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      expect(axiosInstance.get).not.toHaveBeenCalled()
    })

    it('should handle empty steps object', () => {
      const jobWithEmptySteps = {
        ...mockJob,
        mongo: {
          ...mockJob.mongo,
          steps: {}
        }
      } as BilboMDJobDTO

      renderWithProviders(<JobError job={jobWithEmptySteps} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      expect(axiosInstance.get).not.toHaveBeenCalled()
    })
  })

  describe('token handling', () => {
    it('should use token from auth state', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: mockLogContent }
      })

      const customToken = 'custom-auth-token'
      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: customToken }
        }
      })

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: {
              Authorization: `Bearer ${customToken}`
            }
          })
        )
      })
    })
  })

  describe('log content display', () => {
    it('should display empty log when no content', () => {
      renderWithProviders(<JobError job={mockJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      const preElement = document.querySelector('pre')
      expect(preElement).toBeInTheDocument()
      expect(preElement?.textContent).toBe('')
    })

    it('should fetch log with correct step parameter', async () => {
      const specificErrorJob = {
        ...mockJob,
        mongo: {
          ...mockJob.mongo,
          steps: {
            pdb2crd: { status: 'Success', message: 'Done' },
            minimize: { status: 'Success', message: 'Done' },
            md: { status: 'Error', message: 'MD failed' }
          }
        }
      } as BilboMDJobDTO

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { logContent: 'MD error log' }
      })

      renderWithProviders(<JobError job={specificErrorJob} />, {
        preloadedState: {
          auth: { token: 'test-token' }
        }
      })

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith(
          'jobs/job-123/logs?step=md',
          expect.any(Object)
        )
      })
    })
  })
})
