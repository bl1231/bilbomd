import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from 'test/test-utils'
import EnsembleTogglePanel from '../EnsembleTogglePanel'

const baseProps = {
  ensembleSizes: [],
  visibility: {},
  onSelect: vi.fn()
}

describe('EnsembleTogglePanel', () => {
  describe('visibility', () => {
    it('renders nothing when there are no ensembles and no constraints', () => {
      const { container } = renderWithProviders(
        <EnsembleTogglePanel {...baseProps} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders a size chip when there is only one ensemble and no constraints', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1]}
          visibility={{ 1: true }}
        />
      )
      expect(screen.getByText('Size 1')).toBeInTheDocument()
      expect(screen.getByText('Ensembles:')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Hide All|Show All/ })).not.toBeInTheDocument()
    })

    it('renders only the domain button when constraints exist but fewer than 2 ensembles', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          hasConstraints={true}
          onColorByDomain={vi.fn()}
        />
      )
      expect(screen.getByRole('button', { name: 'Color by Domain' })).toBeInTheDocument()
      expect(screen.queryByText('Ensembles:')).not.toBeInTheDocument()
    })

    it('renders ensemble controls when there are 2+ ensembles', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
        />
      )
      expect(screen.getByText('Ensembles:')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Size 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Size 2' })).toBeInTheDocument()
    })

    it('does not render a Show All / Hide All button', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
        />
      )
      expect(
        screen.queryByRole('button', { name: /Hide All|Show All/ })
      ).not.toBeInTheDocument()
    })

    it('renders both ensemble controls and domain button when both apply', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          hasConstraints={true}
          onColorByDomain={vi.fn()}
        />
      )
      expect(screen.getByText('Ensembles:')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Color by Domain' })).toBeInTheDocument()
    })

    it('does not render domain button when hasConstraints is false', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          hasConstraints={false}
          onColorByDomain={vi.fn()}
        />
      )
      expect(screen.queryByRole('button', { name: 'Color by Domain' })).not.toBeInTheDocument()
    })

    it('does not render domain button when onColorByDomain is not provided', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          hasConstraints={true}
        />
      )
      expect(screen.queryByRole('button', { name: 'Color by Domain' })).not.toBeInTheDocument()
    })
  })

  describe('domain color button', () => {
    it('renders as outlined when domainColorActive is false', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          hasConstraints={true}
          domainColorActive={false}
          onColorByDomain={vi.fn()}
        />
      )
      const btn = screen.getByRole('button', { name: 'Color by Domain' })
      expect(btn).toHaveClass('MuiButton-outlined')
    })

    it('renders as contained when domainColorActive is true', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          hasConstraints={true}
          domainColorActive={true}
          onColorByDomain={vi.fn()}
        />
      )
      const btn = screen.getByRole('button', { name: 'Color by Domain' })
      expect(btn).toHaveClass('MuiButton-contained')
    })

    it('calls onColorByDomain when clicked', async () => {
      const onColorByDomain = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          hasConstraints={true}
          onColorByDomain={onColorByDomain}
        />
      )
      await userEvent.click(screen.getByRole('button', { name: 'Color by Domain' }))
      expect(onColorByDomain).toHaveBeenCalledOnce()
    })
  })

  describe('ensemble controls', () => {
    it('marks the visible ensemble size as selected (exclusive)', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
        />
      )
      expect(screen.getByRole('button', { name: 'Size 1' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(screen.getByRole('button', { name: 'Size 2' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('calls onSelect when a different ensemble size is clicked', async () => {
      const onSelect = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          onSelect={onSelect}
        />
      )
      await userEvent.click(screen.getByRole('button', { name: 'Size 2' }))
      expect(onSelect).toHaveBeenCalledWith(2)
    })

    it('does not call onSelect when the already-selected size is clicked', async () => {
      const onSelect = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          onSelect={onSelect}
        />
      )
      // Clicking the active button would deselect it in an exclusive group;
      // the panel ignores that so one ensemble is always shown.
      await userEvent.click(screen.getByRole('button', { name: 'Size 1' }))
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  describe('starting model toggle', () => {
    it('is hidden when no starting model is available', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[2]}
          visibility={{ 2: true }}
        />
      )
      expect(
        screen.queryByRole('button', { name: /Starting Model/ })
      ).not.toBeInTheDocument()
    })

    it('shows the toggle when a starting model is available', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[2]}
          visibility={{ 2: true }}
          showStartingModel
          onToggleStartingModel={vi.fn()}
        />
      )
      expect(
        screen.getByRole('button', { name: /Starting Model/ })
      ).toBeInTheDocument()
    })

    it('calls onToggleStartingModel when clicked', async () => {
      const onToggleStartingModel = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[2]}
          visibility={{ 2: true }}
          showStartingModel
          onToggleStartingModel={onToggleStartingModel}
        />
      )
      await userEvent.click(
        screen.getByRole('button', { name: /Starting Model/ })
      )
      expect(onToggleStartingModel).toHaveBeenCalledTimes(1)
    })
  })
})
