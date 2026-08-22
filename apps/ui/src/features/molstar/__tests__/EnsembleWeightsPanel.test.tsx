import { render, screen } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import type { IEnsemble } from '@bilbomd/bilbomd-types'
import EnsembleWeightsPanel from '../EnsembleWeightsPanel'

const makeEnsemble = (size: number): IEnsemble => ({
  size,
  models: [
    {
      rank: 1,
      chi2: 2.89,
      c1: 0.99,
      c2: -0.5,
      states: Array.from({ length: size }, (_, i) => ({
        pdb: `../foxs/rg${i}/dcd2pdb_rg${i}_run1_${i}000.pdb`,
        weight: 1 / size,
        weight_avg: 1 / size,
        weight_stddev: 0.01,
        fraction: 0.1
      }))
    }
  ]
})

describe('EnsembleWeightsPanel', () => {
  test('renders nothing when there are no ensembles', () => {
    const { container } = render(
      <EnsembleWeightsPanel ensembles={[]} visibility={{}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('renders nothing for single-state (size 1) ensembles', () => {
    const { container } = render(
      <EnsembleWeightsPanel
        ensembles={[makeEnsemble(1)]}
        visibility={{ 1: true }}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('shows weights only for visible multi-state ensembles', () => {
    render(
      <EnsembleWeightsPanel
        ensembles={[makeEnsemble(2), makeEnsemble(3)]}
        visibility={{ 2: true, 3: false }}
      />
    )

    expect(screen.getByText('Conformation weights')).toBeInTheDocument()
    expect(screen.getByText('2-state ensemble')).toBeInTheDocument()
    expect(screen.queryByText('3-state ensemble')).not.toBeInTheDocument()

    // Two conformations, each with weight 0.500
    expect(screen.getAllByText('0.500')).toHaveLength(2)
  })

  test('renders a cleaned conformation label (no path, no .pdb)', () => {
    render(
      <EnsembleWeightsPanel
        ensembles={[makeEnsemble(2)]}
        visibility={{ 2: true }}
      />
    )
    expect(screen.getByText('dcd2pdb_rg0_run1_0000')).toBeInTheDocument()
  })

  test('shows no color swatches by default', () => {
    render(
      <EnsembleWeightsPanel
        ensembles={[makeEnsemble(3)]}
        visibility={{ 3: true }}
      />
    )
    expect(screen.queryAllByTestId('conformation-swatch')).toHaveLength(0)
  })

  test('shows one color swatch per conformation when showColors is set', () => {
    render(
      <EnsembleWeightsPanel
        ensembles={[makeEnsemble(3)]}
        visibility={{ 3: true }}
        showColors
      />
    )
    expect(screen.getAllByTestId('conformation-swatch')).toHaveLength(3)
  })
})
