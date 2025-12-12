import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { FileModal } from '../FileModal'

describe('FileModal', () => {
  const defaultProps = {
    open: false,
    onClose: vi.fn(),
    fileContents: '',
    isLoading: false,
    error: null,
    onCopyToClipboard: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not render when closed', () => {
    render(
      <FileModal
        {...defaultProps}
        open={false}
      />
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should render when open', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('CHARMM Constraint File')).toBeInTheDocument()
  })

  it('should show loading state', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
        isLoading={true}
      />
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('should show error message when error occurs', () => {
    const error = new Error('Failed to load file')
    render(
      <FileModal
        {...defaultProps}
        open={true}
        error={error}
      />
    )

    expect(
      screen.getByText('Failed to load file contents.')
    ).toBeInTheDocument()
  })

  it('should show error message for string error', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
        error="Network error"
      />
    )

    expect(
      screen.getByText('Failed to load file contents.')
    ).toBeInTheDocument()
  })

  it('should display file contents when loaded', () => {
    const fileContents = 'This is the constraint file content\nLine 2\nLine 3'
    render(
      <FileModal
        {...defaultProps}
        open={true}
        fileContents={fileContents}
      />
    )

    expect(
      screen.getByText(/This is the constraint file content/)
    ).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FileModal
        {...defaultProps}
        open={true}
        onClose={onClose}
      />
    )

    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onCopyToClipboard when copy button is clicked', () => {
    const onCopyToClipboard = vi.fn()
    render(
      <FileModal
        {...defaultProps}
        open={true}
        onCopyToClipboard={onCopyToClipboard}
      />
    )

    const copyButton = screen.getByRole('button', {
      name: /copy-constraint-file/i
    })
    fireEvent.click(copyButton)

    expect(onCopyToClipboard).toHaveBeenCalledTimes(1)
  })

  it('should show content with correct styling', () => {
    const fileContents = 'Sample constraint file content'
    render(
      <FileModal
        {...defaultProps}
        open={true}
        fileContents={fileContents}
      />
    )

    const content = screen.getByText(fileContents)
    expect(content).toBeInTheDocument()
  })

  it('should handle undefined file contents', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
        fileContents={undefined}
      />
    )

    expect(screen.getByText('No content available.')).toBeInTheDocument()
  })

  it('should have accessible dialog properties', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should not show content when loading', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
        isLoading={true}
      />
    )

    expect(screen.queryByText('No content available.')).not.toBeInTheDocument()
  })

  it('should not show content when error occurs', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
        error="Some error"
      />
    )

    expect(screen.queryByText('No content available.')).not.toBeInTheDocument()
  })

  it('should apply correct dialog styles', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('should render with correct dialog structure', () => {
    render(
      <FileModal
        {...defaultProps}
        open={true}
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })
})
