import { screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import ChangeEmail from '../ChangeEmail'
import { renderWithProviders } from 'test/test-utils'
import useAuth from 'hooks/useAuth'
import useLogout from 'hooks/useLogout'
import {
  useUpdateEmailMutation,
  useVerifyOtpMutation,
  useResendOtpMutation
} from '../../../slices/userAccountApiSlice'

vi.mock('hooks/useAuth')
vi.mock('hooks/useLogout')
vi.mock('../../../slices/userAccountApiSlice')

const updateEmail = vi.fn()
const verifyOtp = vi.fn()
const resendOtp = vi.fn()

const resolves = () => ({ unwrap: () => Promise.resolve() })
const rejects = (error: unknown) => ({ unwrap: () => Promise.reject(error) })

const mockUser = (username = 'testuser') =>
  (useAuth as Mock).mockReturnValue({
    username,
    email: 'testuser@example.com'
  })

beforeEach(() => {
  vi.clearAllMocks()
  mockUser()
  ;(useLogout as Mock).mockReturnValue(vi.fn())
  ;(useUpdateEmailMutation as Mock).mockReturnValue([updateEmail, {}])
  ;(useVerifyOtpMutation as Mock).mockReturnValue([verifyOtp, {}])
  ;(useResendOtpMutation as Mock).mockReturnValue([resendOtp, {}])
  updateEmail.mockReturnValue(resolves())
  verifyOtp.mockReturnValue(resolves())
  resendOtp.mockReturnValue(resolves())
})

const requestCode = async (newEmail = 'new@example.com') => {
  fireEvent.change(screen.getByLabelText(/New email address/i), {
    target: { value: newEmail }
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Send verification code' })
  )
  return screen.findByLabelText('Code')
}

describe('ChangeEmail', () => {
  it('shows the current email', () => {
    renderWithProviders(<ChangeEmail />)
    expect(screen.getByText('testuser@example.com')).toBeInTheDocument()
  })

  it('requires a new email address', async () => {
    renderWithProviders(<ChangeEmail />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' })
    )
    expect(
      await screen.findByText('New email address is required')
    ).toBeInTheDocument()
    expect(updateEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid email address', async () => {
    renderWithProviders(<ChangeEmail />)
    fireEvent.change(screen.getByLabelText(/New email address/i), {
      target: { value: 'not-an-email' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' })
    )
    expect(await screen.findByText('Invalid email address')).toBeInTheDocument()
  })

  it('sends a code, then verifies it with the new address', async () => {
    renderWithProviders(<ChangeEmail />)
    const codeInput = await requestCode()

    expect(updateEmail).toHaveBeenCalledWith({
      username: 'testuser',
      currentEmail: 'testuser@example.com',
      newEmail: 'new@example.com'
    })

    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))

    expect(
      await screen.findByText(/Your email address is updated/i)
    ).toBeInTheDocument()
    expect(verifyOtp).toHaveBeenCalledWith({
      username: 'testuser',
      currentEmail: 'testuser@example.com',
      newEmail: 'new@example.com',
      otp: '123456'
    })
  })

  it('explains when the email belongs to another account', async () => {
    updateEmail.mockReturnValue(rejects({ status: 409 }))
    renderWithProviders(<ChangeEmail />)

    fireEvent.change(screen.getByLabelText(/New email address/i), {
      target: { value: 'taken@example.com' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Send verification code' })
    )

    expect(
      await screen.findByText(/already associated with another account/i)
    ).toBeInTheDocument()
  })

  it('shows the server message when the code is wrong', async () => {
    verifyOtp.mockReturnValue(
      rejects({ status: 400, data: { message: 'Invalid OTP' } })
    )
    renderWithProviders(<ChangeEmail />)
    const codeInput = await requestCode()

    fireEvent.change(codeInput, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))

    expect(await screen.findByText('Invalid OTP')).toBeInTheDocument()
  })

  it('resends the code to the pending address', async () => {
    renderWithProviders(<ChangeEmail />)
    await requestCode()

    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))

    await waitFor(() =>
      expect(resendOtp).toHaveBeenCalledWith({
        username: 'testuser',
        currentEmail: 'testuser@example.com',
        newEmail: 'new@example.com'
      })
    )
  })

  it('does not offer a change form to ORCID accounts', () => {
    mockUser('orcid-0000-0002-1234-5678')
    renderWithProviders(<ChangeEmail />)

    expect(screen.getByText(/You sign in with ORCID/i)).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/New email address/i)
    ).not.toBeInTheDocument()
  })
})
