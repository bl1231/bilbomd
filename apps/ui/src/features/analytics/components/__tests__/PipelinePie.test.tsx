import React from 'react'
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import { PipelinePie } from '../PipelinePie'

describe('PipelinePie', () => {
  it('renders a chart when data is provided', () => {
    const { container } = renderWithProviders(
      <PipelinePie
        data={[
          { name: 'pdb', value: 12 },
          { name: 'crd', value: 8 }
        ]}
      />
    )
    // recharts renders an SVG surface for the pie
    expect(container.querySelector('.recharts-responsive-container')).not.toBeNull()
    expect(screen.queryByText(/No data to display/i)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is no data', () => {
    renderWithProviders(
      <PipelinePie
        data={[]}
        emptyText="No usage events recorded yet."
      />
    )
    expect(
      screen.getByText(/No usage events recorded yet/i)
    ).toBeInTheDocument()
  })

  it('shows a skeleton when loading', () => {
    const { container } = renderWithProviders(
      <PipelinePie
        data={[]}
        isLoading
      />
    )
    expect(container.querySelector('.MuiSkeleton-root')).not.toBeNull()
  })
})
