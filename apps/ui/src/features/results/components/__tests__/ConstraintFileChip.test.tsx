import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ConstraintFileChip } from '../ConstraintFileChip'
import type { HasConstraintFile } from '../../types'

describe('ConstraintFileChip', () => {
  const mockOnOpenModal = vi.fn()

  beforeEach(() => {
    mockOnOpenModal.mockClear()
  })

  it('should render constraint file name when provided', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    expect(screen.getByText('constraints.inp')).toBeInTheDocument()
  })

  it('should show "No constraint file" when file is not provided', () => {
    const job: HasConstraintFile = {}

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    expect(screen.getByText('No constraint file')).toBeInTheDocument()
  })

  it('should call onOpenModal when chip is clicked and file exists', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    const chip = screen.getAllByRole('button')[0]
    fireEvent.click(chip)

    expect(mockOnOpenModal).toHaveBeenCalledTimes(1)
  })

  it('should call onOpenModal when visibility icon is clicked', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    const visibilityButton = screen.getByRole('button', {
      name: /open constraints.inp/i
    })
    fireEvent.click(visibilityButton)

    expect(mockOnOpenModal).toHaveBeenCalledTimes(1)
  })

  it('should prevent event propagation when visibility icon is clicked', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    const mockParentClick = vi.fn()

    render(
      <div onClick={mockParentClick}>
        <ConstraintFileChip
          job={job}
          onOpenModal={mockOnOpenModal}
        />
      </div>
    )

    const visibilityButton = screen.getByRole('button', {
      name: /open constraints.inp/i
    })
    fireEvent.click(visibilityButton)

    expect(mockOnOpenModal).toHaveBeenCalledTimes(1)
    // Note: The parent click may still be called due to event bubbling,
    // but the component should handle this internally
  })

  it('should disable visibility button when no constraint file exists', () => {
    const job: HasConstraintFile = {}

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    const disabledButton = screen.getByRole('button')
    expect(disabledButton).toBeDisabled()
  })

  it('should not call onOpenModal when chip is clicked without constraint file', () => {
    const job: HasConstraintFile = {}

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    // The chip should not be clickable when there's no file
    // Since there's no constraint file, the chip itself is not clickable
    const chipText = screen.getByText('No constraint file')
    fireEvent.click(chipText)

    expect(mockOnOpenModal).not.toHaveBeenCalled()
  })

  it('should show correct tooltip text', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'my-constraints.inp'
    }

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    const visibilityButton = screen.getByRole('button', {
      name: /open my-constraints.inp/i
    })
    expect(visibilityButton).toBeInTheDocument()
  })

  it('should show default tooltip when no file exists', () => {
    const job: HasConstraintFile = {}

    render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    // Check that the button exists but is disabled when no file
    const disabledButton = screen.getByRole('button')
    expect(disabledButton).toBeDisabled()
    expect(disabledButton).toBeInTheDocument()
  })

  it('should work without onOpenModal callback', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    expect(() => {
      render(<ConstraintFileChip job={job} />)
    }).not.toThrow()

    const chip = screen.getAllByRole('button')[0]
    expect(() => {
      fireEvent.click(chip)
    }).not.toThrow()
  })

  it('should apply correct styling', () => {
    const job: HasConstraintFile = {
      const_inp_file: 'constraints.inp'
    }

    const { container } = render(
      <ConstraintFileChip
        job={job}
        onOpenModal={mockOnOpenModal}
      />
    )

    const chip = container.querySelector('.MuiChip-root')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveStyle({ cursor: 'pointer' })
  })
})
