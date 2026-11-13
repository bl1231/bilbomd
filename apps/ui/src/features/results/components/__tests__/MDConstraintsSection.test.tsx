import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import { MDConstraintsSection } from '../MDConstraintsSection'

const constraints: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [{ chain_id: 'A', residues: { start: 1, stop: 100 } }]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [{ chain_id: 'A', residues: { start: 120, stop: 200 } }]
    }
  ]
}

describe('MDConstraintsSection', () => {
  it('shows the compact track, with the schematic closed', () => {
    render(<MDConstraintsSection constraints={constraints} />)
    expect(screen.getByTestId('constraint-track-A')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Show schematic' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('md-constraints-schematic')).toBeNull()
  })

  it('opens and closes the schematic', async () => {
    const user = userEvent.setup()
    render(<MDConstraintsSection constraints={constraints} />)
    await user.click(screen.getByRole('button', { name: 'Show schematic' }))
    const panel = screen.getByTestId('md-constraints-schematic')
    expect(panel).toBeInTheDocument()
    expect(screen.getAllByTestId('schematic-body')).toHaveLength(2)
    const hide = screen.getByRole('button', { name: 'Hide schematic' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    expect(hide).toHaveAttribute('aria-controls', panel.id)
    await user.click(hide)
    // Unmounted once closed, so its simulation stops
    await waitFor(() =>
      expect(screen.queryByTestId('md-constraints-schematic')).toBeNull()
    )
  })

  it('offers no schematic when there are no bodies', () => {
    render(<MDConstraintsSection constraints={{ fixed_bodies: [] }} />)
    expect(screen.queryByRole('button', { name: /schematic/i })).toBeNull()
  })
})
