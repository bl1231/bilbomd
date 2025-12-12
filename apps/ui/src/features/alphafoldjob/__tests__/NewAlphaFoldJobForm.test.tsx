import React from 'react'
import { describe, it, beforeEach, vi, Mock } from 'vitest'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import NewAlphaFoldJob from '../NewAlphaFoldJobForm'
import { useAddNewAlphaFoldJobMutation } from 'slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import { useGetConfigsQuery } from 'slices/configsApiSlice'

// Mock all the dependencies
vi.mock('slices/jobsApiSlice', () => ({
  useAddNewAlphaFoldJobMutation: vi.fn()
}))

vi.mock('slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: vi.fn()
}))

vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: vi.fn()
}))

vi.mock('react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useNavigate: () => vi.fn()
}))

vi.mock('@mui/material/styles', () => ({
  useTheme: vi.fn(() => ({ palette: { mode: 'light' } }))
}))

vi.mock('features/jobs/FileSelect', () => ({
  __esModule: true,
  default: ({ onFileSelect }: { onFileSelect: (file: File) => void }) => (
    <div data-testid="file-select">
      <input
        type="file"
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelect(file)
        }}
      />
    </div>
  )
}))

vi.mock('features/nersc/NerscStatusChecker', () => ({
  __esModule: true,
  default: () => <div data-testid="nersc-status-checker">NERSC Status</div>
}))

vi.mock('components/HeaderBox', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header-box">{children}</div>
  )
}))

vi.mock('hooks/useTitle', () => ({
  __esModule: true,
  default: () => {}
}))

vi.mock('features/alphafoldjob/NewAlphaFoldJobFormInstructions', () => ({
  __esModule: true,
  default: () => (
    <div data-testid="form-instructions">AlphaFold Job Instructions</div>
  )
}))

// Mock the new success alert components
vi.mock('features/jobs/JobSuccessAlert', () => ({
  __esModule: true,
  default: ({
    jobData
  }: {
    jobData: { resultUrl: string; publicId: string }
  }) => (
    <div data-testid="job-success-alert">
      Job submitted successfully! Job ID: {jobData.publicId}
    </div>
  )
}))

vi.mock('features/jobs/PublicJobSuccessAlert', () => ({
  __esModule: true,
  default: ({
    jobData
  }: {
    jobData: { resultUrl: string; publicId: string }
  }) => (
    <div data-testid="public-job-success-alert">
      Anonymous job submitted successfully! Public ID: {jobData.publicId}
    </div>
  )
}))

describe('NewAlphaFoldJob Component', () => {
  const mockAddNewAlphaFoldJob = vi.fn()
  const mockAddNewPublicJob = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    ;(useAddNewAlphaFoldJobMutation as Mock).mockReturnValue([
      mockAddNewAlphaFoldJob,
      {
        isLoading: false,
        isSuccess: false,
        isError: false,
        error: null,
        data: null
      }
    ])
    ;(useAddNewPublicJobMutation as Mock).mockReturnValue([
      mockAddNewPublicJob,
      {
        isLoading: false,
        isSuccess: false,
        isError: false,
        error: null,
        data: null
      }
    ])
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false
    })
  })

  it('should render the component without crashing', () => {
    render(<NewAlphaFoldJob />)
    // Basic smoke test - if component renders without error, test passes
  })

  it('should render loading state', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: null,
      error: null,
      isLoading: true
    })

    render(<NewAlphaFoldJob />)
    // Component should render loading state
  })

  it('should handle config error', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: null,
      error: { message: 'Failed to load' },
      isLoading: false
    })

    render(<NewAlphaFoldJob />)
    // Component should render error state
  })

  it('should handle config loaded', () => {
    render(<NewAlphaFoldJob />)
    // Component should render form when config is loaded
  })
})
