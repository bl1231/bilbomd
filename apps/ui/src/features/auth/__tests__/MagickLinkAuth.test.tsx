import { renderWithProviders } from 'test/test-utils'
import { screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import MagickLinkAuth from '../MagickLinkAuth'
import { useLoginMutation } from 'slices/authApiSlice'
// import { setCredentials } from 'slices/authSlice'
import { useParams, useNavigate } from 'react-router'
import { useDispatch } from 'react-redux'

vi.mock('react-router', async () => {
  const actual = await import('react-router')
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn()
  }
})

vi.mock('slices/authApiSlice', () => ({
  useLoginMutation: vi.fn()
}))

vi.mock('slices/authSlice', async () => {
  const actual = await import('slices/authSlice')
  return {
    ...actual,
    setCredentials: vi.fn()
  }
})

// Mock react-redux's useDispatch
vi.mock('react-redux', async () => {
  const actual = await import('react-redux')
  return {
    ...actual,
    useDispatch: vi.fn()
  }
})

describe('MagickLinkAuth Component', () => {
  const mockLogin = vi.fn()
  const mockDispatch = vi.fn()
  const mockNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // vi.useFakeTimers()
    vi.mocked(useParams).mockReturnValue({ otp: 'valid-otp' })
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    vi.mocked(useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, reset: vi.fn() }
    ])
    vi.mocked(useDispatch).mockReturnValue(mockDispatch)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })
  it('renders loading state initially', async () => {
    vi.mocked(useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: true, reset: vi.fn() }
    ])

    renderWithProviders(<MagickLinkAuth />)

    // screen.debug()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  // it('renders success message after valid OTP', async () => {
  //   // Mock the login function to return a resolved promise
  //   mockLogin.mockReturnValueOnce({
  //     unwrap: vi.fn().mockResolvedValue({ accessToken: 'valid-token' })
  //   })

  //   renderWithProviders(<MagickLinkAuth />)

  //   // Check if the success message appears after the OTP is validated
  //   await waitFor(() => {
  //     expect(
  //       screen.getByText(/Your OTP has been successfully validated/i)
  //     ).toBeInTheDocument()
  //   })

  //   // Verify the credentials were dispatched
  //   expect(mockDispatch).toHaveBeenCalledWith(
  //     setCredentials({ accessToken: 'valid-token' })
  //   )

  //   // Advance the timers by 3000ms to trigger the setTimeout
  //   console.log('Advancing timers now...')
  //   // vi.advanceTimersByTime(3000)

  //   // Ensure all timers (including nested ones) are run
  //   vi.runAllTimers()

  //   // Check the mockNavigate function calls
  //   console.log(mockNavigate.mock.calls)

  //   expect(mockNavigate).toBeCalled()

  //   // Now check if the navigation happened after the timeout
  //   expect(mockNavigate).toHaveBeenCalledWith('../dashboard/jobs')
  //   console.log('Test complete')
  // })

  // RTK Query rejects with { status, data }, the shape unwrap() throws
  const rejectWith = (error: object) =>
    mockLogin.mockReturnValueOnce({ unwrap: () => Promise.reject(error) })

  it('explains an invalid OTP with the server message', async () => {
    rejectWith({ status: 401, data: { message: 'Invalid OTP' } })

    renderWithProviders(<MagickLinkAuth />)

    expect(
      await screen.findByText(/Maybe your MagickLink/i)
    ).toBeInTheDocument()
    expect(screen.getByText('Invalid OTP')).toBeInTheDocument()
  })

  it('shows why an expired link failed', async () => {
    rejectWith({ status: 401, data: { error: 'OTP has expired' } })

    renderWithProviders(<MagickLinkAuth />)

    expect(await screen.findByText('OTP has expired')).toBeInTheDocument()
  })

  it('tells the user to slow down when rate limited', async () => {
    rejectWith({
      status: 429,
      data: {
        message:
          'Too many login attempts from this IP, please try again after a 60 second pause'
      }
    })

    renderWithProviders(<MagickLinkAuth />)

    expect(await screen.findByText('Too many attempts')).toBeInTheDocument()
    expect(screen.getByText(/60 second pause/)).toBeInTheDocument()
    expect(screen.queryByText(/Maybe your MagickLink/i)).not.toBeInTheDocument()
  })

  it('says when the server cannot be reached', async () => {
    rejectWith({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })

    renderWithProviders(<MagickLinkAuth />)

    expect(
      await screen.findByText(/Could not reach the BilboMD server/)
    ).toBeInTheDocument()
  })
})
