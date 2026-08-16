import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import CopyableChip from '../CopyableChip'

const mockNavigate = vi.fn()
const mockEnqueueSnackbar = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar })
}))

describe('CopyableChip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  it('renders the value and copies it to the clipboard', () => {
    render(
      <CopyableChip
        label="UUID"
        value="b6361f0a-b8e5-464c-a99a-e350a0b2869c"
      />
    )
    expect(
      screen.getByText('b6361f0a-b8e5-464c-a99a-e350a0b2869c')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /copy uuid/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'b6361f0a-b8e5-464c-a99a-e350a0b2869c'
    )
    expect(mockEnqueueSnackbar).toHaveBeenCalled()
  })

  it('shows a launch button that navigates when a url is given', () => {
    render(
      <CopyableChip
        label="Public UUID"
        value="abc123"
        url="/results/abc123"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /go to/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/results/abc123')
  })
})
