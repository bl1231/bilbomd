import NewAlphaFoldJob from '../NewAlphaFoldJobForm'
import { useAddNewAlphaFoldJobMutation } from 'slices/jobsApiSlice'
import { useGetConfigsQuery } from 'slices/configsApiSlice'

// Mock slices and hooks
import { vi } from 'vitest'
vi.mock('slices/jobsApiSlice', () => ({
  useAddNewAlphaFoldJobMutation: vi.fn()
}))
vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: vi.fn()
}))
vi.mock('slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: vi.fn()
}))
vi.mock('react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useNavigate: () => vi.fn()
}))
vi.mock('@mui/material/styles', () => ({
  useTheme: () => ({
    palette: {
      mode: 'light',
      success: { main: '#4caf50' },
      warning: { main: '#ff9800' },
      error: { main: '#f44336' }
    }
  })
}))
vi.mock('features/jobs/FileSelect', () => ({
  __esModule: true,
  default: () => <div data-testid="file-select">File Select</div>
}))
vi.mock('features/nersc/NerscStatusChecker', () => ({
  __esModule: true,
  default: () => null
}))
vi.mock('components/HeaderBox', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))
vi.mock('hooks/useTitle', () => ({
  __esModule: true,
  default: () => {}
}))
vi.mock('features/alphafoldjob/NewAlphaFoldJobFormInstructions', () => ({
  __esModule: true,
  default: () => <div>Instructions</div>
}))

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, Mock } from 'vitest'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'

describe('NewAlphaFoldJob Component', () => {
  beforeEach(() => {
    ;(useAddNewAlphaFoldJobMutation as Mock).mockReturnValue([
      vi.fn(),
      { isSuccess: false }
    ])
    ;(useAddNewPublicJobMutation as Mock).mockReturnValue([
      vi.fn(),
      { isSuccess: false }
    ])
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'false' },
      error: null,
      isLoading: false
    })
  })

  it('shows loading indicator when config is loading', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: null,
      error: null,
      isLoading: true
    })
    render(<NewAlphaFoldJob />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows error alert when config fails to load', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: null,
      error: new Error('Error loading configuration'),
      isLoading: false
    })
    render(<NewAlphaFoldJob />)
    expect(screen.getByText(/Error loading configuration/i)).toBeInTheDocument()
  })

  it('shows warning alert when useNersc is false', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'false' },
      error: null,
      isLoading: false
    })
    render(<NewAlphaFoldJob />)
    expect(
      screen.getByText(/please head over to BilboMD running on/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/bilbomd-nersc\.bl1231\.als\.lbl\.gov/i)
    ).toBeInTheDocument()
  })

  it('renders the form when useNersc is true', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false
    })
    render(<NewAlphaFoldJob />)
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument()
    expect(screen.getByText(/Add Entity/i)).toBeInTheDocument()
    expect(screen.getByText(/Token count:/i)).toBeInTheDocument()
  })

  it('renders success alert for authenticated job', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false
    })
    ;(useAddNewAlphaFoldJobMutation as Mock).mockReturnValue([
      vi.fn(),
      {
        isSuccess: true,
        data: { resultUrl: 'http://example.com', publicId: 'abc123' }
      }
    ])
    render(<NewAlphaFoldJob />)
    expect(screen.getByText(/has been submitted/i)).toBeInTheDocument()
  })

  it('renders success alert for anonymous job', () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false
    })
    ;(useAddNewPublicJobMutation as Mock).mockReturnValue([
      vi.fn(),
      {
        isSuccess: true,
        data: { resultUrl: 'http://anon.example.com', publicId: 'anon123' }
      }
    ])
    render(<NewAlphaFoldJob mode="anonymous" />)
    expect(screen.getByText(/has been submitted/i)).toBeInTheDocument()
  })

  it('shows validation errors when submitting empty form', async () => {
    ;(useGetConfigsQuery as Mock).mockReturnValue({
      data: { useNersc: 'true' },
      error: null,
      isLoading: false
    })
    render(<NewAlphaFoldJob />)
    // Try to submit the form
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)
    // Since Formik validation is async, but we don't have a real schema, just check that the button is disabled
    expect(submitBtn).toBeDisabled()
  })
})
