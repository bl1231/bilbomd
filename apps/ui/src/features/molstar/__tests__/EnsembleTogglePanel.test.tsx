import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from 'test/test-utils'
import EnsembleTogglePanel from '../EnsembleTogglePanel'

const baseProps = {
  ensembleSizes: [],
  visibility: {},
  onToggle: vi.fn(),
  onToggleAll: vi.fn()
}

describe('EnsembleTogglePanel', () => {
  describe('visibility', () => {
    it('renders nothing when there are no ensembles and no constraints', () => {
      const { container } = renderWithProviders(
        <EnsembleTogglePanel {...baseProps} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders nothing when there is only one ensemble and no constraints', () => {
      const { container } = renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1]}
          visibility={{ 1: true }}
        />
      )
      expect(container.firstChild).toBeNull()
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
      expect(screen.getByRole('button', { name: 'Show All' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Size 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Size 2' })).toBeInTheDocument()
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
    it('shows "Hide All" when all ensembles are visible', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: true }}
        />
      )
      expect(screen.getByRole('button', { name: 'Hide All' })).toBeInTheDocument()
    })

    it('shows "Show All" when not all ensembles are visible', () => {
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
        />
      )
      expect(screen.getByRole('button', { name: 'Show All' })).toBeInTheDocument()
    })

    it('calls onToggleAll with "hide" when Hide All is clicked', async () => {
      const onToggleAll = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: true }}
          onToggleAll={onToggleAll}
        />
      )
      await userEvent.click(screen.getByRole('button', { name: 'Hide All' }))
      expect(onToggleAll).toHaveBeenCalledWith('hide')
    })

    it('calls onToggle when an ensemble size button is clicked', async () => {
      const onToggle = vi.fn()
      renderWithProviders(
        <EnsembleTogglePanel
          {...baseProps}
          ensembleSizes={[1, 2]}
          visibility={{ 1: true, 2: false }}
          onToggle={onToggle}
        />
      )
      await userEvent.click(screen.getByRole('button', { name: 'Size 2' }))
      expect(onToggle).toHaveBeenCalledWith(2)
    })
  })
})
