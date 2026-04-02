import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import userEvent from '@testing-library/user-event'
import { JobActionsMenu } from '../JobActionsMenu'

describe('JobActionsMenu', () => {
  const mockOnClose = vi.fn()
  const mockOnResubmit = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnDownload = vi.fn()

  const defaultProps = {
    jobId: 'job-123',
    jobType: 'BilboMdPDB',
    jobTitle: 'Test Job',
    jobStatus: 'Completed',
    resultsReady: true,
    anchorEl: document.createElement('div'),
    open: true,
    onClose: mockOnClose,
    onResubmit: mockOnResubmit,
    onDelete: mockOnDelete,
    onDownload: mockOnDownload
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render menu with Resubmit, Download Results, and Delete actions', () => {
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      expect(screen.getByText('Resubmit')).toBeInTheDocument()
      expect(screen.getByText('Download Results')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('should render AutorenewIcon for Resubmit', () => {
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      const icon = document.querySelector('[data-testid="AutorenewIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render DeleteIcon for Delete', () => {
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      const icon = document.querySelector('[data-testid="DeleteIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render divider between menu items', () => {
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      const divider = document.querySelector('.MuiDivider-root')
      expect(divider).toBeInTheDocument()
    })

    it('should not render when open is false', () => {
      renderWithProviders(
        <JobActionsMenu {...defaultProps} open={false} />
      )

      const resubmitButton = screen.queryByText('Resubmit')
      // Menu should not be visible when open is false
      if (resubmitButton) {
        expect(resubmitButton).not.toBeVisible()
      } else {
        expect(resubmitButton).toBeNull()
      }
    })
  })

  describe('Resubmit button - enabled job types', () => {
    const enabledJobTypes = ['BilboMdPDB', 'BilboMdCRD', 'BilboMdAuto']

    enabledJobTypes.forEach((jobType) => {
      it(`should enable Resubmit for ${jobType}`, () => {
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobType={jobType} />
        )

        const resubmitButton = screen.getByText('Resubmit').closest('li')
        expect(resubmitButton).not.toHaveClass('Mui-disabled')
      })

      it(`should call onResubmit with correct args for ${jobType}`, async () => {
        const user = userEvent.setup()
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobType={jobType} />
        )

        const resubmitButton = screen.getByText('Resubmit')
        await user.click(resubmitButton)

        expect(mockOnResubmit).toHaveBeenCalledWith('job-123', jobType)
        expect(mockOnResubmit).toHaveBeenCalledTimes(1)
      })

      it(`should call onClose after Resubmit click for ${jobType}`, async () => {
        const user = userEvent.setup()
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobType={jobType} />
        )

        const resubmitButton = screen.getByText('Resubmit')
        await user.click(resubmitButton)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Resubmit button - disabled job types', () => {
    const disabledJobTypes = [
      'BilboMdAlphaFold',
      'BilboMdSANS',
      'BilboMdScoper',
      'BilboMdMulti',
      'UnknownType'
    ]

    disabledJobTypes.forEach((jobType) => {
      it(`should disable Resubmit for ${jobType}`, () => {
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobType={jobType} />
        )

        const resubmitButton = screen.getByText('Resubmit').closest('li')
        expect(resubmitButton).toHaveClass('Mui-disabled')
      })
    })
  })

  describe('Delete button - disabled statuses', () => {
    const disabledStatuses = ['Running', 'Submitted']

    disabledStatuses.forEach((status) => {
      it(`should disable Delete when status is ${status}`, () => {
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobStatus={status} />
        )

        const deleteButton = screen.getByText('Delete').closest('li')
        expect(deleteButton).toHaveClass('Mui-disabled')
      })
    })
  })

  describe('Delete button - enabled statuses', () => {
    const enabledStatuses = ['Completed', 'Error', 'Pending', 'Cancelled']

    enabledStatuses.forEach((status) => {
      it(`should enable Delete when status is ${status}`, () => {
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobStatus={status} />
        )

        const deleteButton = screen.getByText('Delete').closest('li')
        expect(deleteButton).not.toHaveClass('Mui-disabled')
      })

      it(`should call onDelete with correct args when status is ${status}`, async () => {
        const user = userEvent.setup()
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobStatus={status} />
        )

        const deleteButton = screen.getByText('Delete')
        await user.click(deleteButton)

        expect(mockOnDelete).toHaveBeenCalledWith('job-123', 'Test Job')
        expect(mockOnDelete).toHaveBeenCalledTimes(1)
      })

      it(`should call onClose after Delete click when status is ${status}`, async () => {
        const user = userEvent.setup()
        renderWithProviders(
          <JobActionsMenu {...defaultProps} jobStatus={status} />
        )

        const deleteButton = screen.getByText('Delete')
        await user.click(deleteButton)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Download Results button', () => {
    it('should be enabled when status is Completed and resultsReady is true', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobStatus="Completed"
          resultsReady={true}
        />
      )

      const downloadButton = screen.getByText('Download Results').closest('li')
      expect(downloadButton).not.toHaveClass('Mui-disabled')
    })

    it('should be disabled when resultsReady is false', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobStatus="Completed"
          resultsReady={false}
        />
      )

      const downloadButton = screen.getByText('Download Results').closest('li')
      expect(downloadButton).toHaveClass('Mui-disabled')
    })

    it('should be disabled when resultsReady is undefined', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobStatus="Completed"
          resultsReady={undefined}
        />
      )

      const downloadButton = screen.getByText('Download Results').closest('li')
      expect(downloadButton).toHaveClass('Mui-disabled')
    })

    it('should be disabled when status is not Completed', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobStatus="Running"
          resultsReady={true}
        />
      )

      const downloadButton = screen.getByText('Download Results').closest('li')
      expect(downloadButton).toHaveClass('Mui-disabled')
    })

    it('should call onDownload with jobId and close menu on click', async () => {
      const user = userEvent.setup()
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      const downloadButton = screen.getByText('Download Results')
      await user.click(downloadButton)

      expect(mockOnDownload).toHaveBeenCalledWith('job-123')
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Delete button styling', () => {
    it('should have error color styling', () => {
      renderWithProviders(<JobActionsMenu {...defaultProps} />)

      const deleteButton = screen.getByText('Delete').closest('li')
      expect(deleteButton).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    })
  })

  describe('menu interaction', () => {
    it('should handle menu open state', () => {
      renderWithProviders(
        <JobActionsMenu {...defaultProps} open={true} />
      )

      // When open, menu items should be in the document
      expect(screen.getByText('Resubmit')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  describe('prop combinations', () => {
    it('should handle enabled Resubmit and disabled Delete', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobType="BilboMdPDB"
          jobStatus="Running"
        />
      )

      const resubmitButton = screen.getByText('Resubmit').closest('li')
      const deleteButton = screen.getByText('Delete').closest('li')

      expect(resubmitButton).not.toHaveClass('Mui-disabled')
      expect(deleteButton).toHaveClass('Mui-disabled')
    })

    it('should handle disabled Resubmit and enabled Delete', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobType="BilboMdScoper"
          jobStatus="Completed"
        />
      )

      const resubmitButton = screen.getByText('Resubmit').closest('li')
      const deleteButton = screen.getByText('Delete').closest('li')

      expect(resubmitButton).toHaveClass('Mui-disabled')
      expect(deleteButton).not.toHaveClass('Mui-disabled')
    })

    it('should handle both buttons disabled', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobType="BilboMdScoper"
          jobStatus="Running"
        />
      )

      const resubmitButton = screen.getByText('Resubmit').closest('li')
      const deleteButton = screen.getByText('Delete').closest('li')

      expect(resubmitButton).toHaveClass('Mui-disabled')
      expect(deleteButton).toHaveClass('Mui-disabled')
    })

    it('should handle both buttons enabled', () => {
      renderWithProviders(
        <JobActionsMenu
          {...defaultProps}
          jobType="BilboMdPDB"
          jobStatus="Completed"
        />
      )

      const resubmitButton = screen.getByText('Resubmit').closest('li')
      const deleteButton = screen.getByText('Delete').closest('li')

      expect(resubmitButton).not.toHaveClass('Mui-disabled')
      expect(deleteButton).not.toHaveClass('Mui-disabled')
    })
  })
})
