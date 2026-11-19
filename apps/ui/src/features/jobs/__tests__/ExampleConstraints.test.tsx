import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'

const mockUseQuery = vi.fn()
vi.mock('slices/publicJobsApiSlice', () => ({
  useGetClassicExampleConstraintsQuery: (...args: unknown[]) =>
    mockUseQuery(...args)
}))

import { ExampleConstraints } from '../ExampleConstraints'

const constraints: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [{ chain_id: 'A', residues: { start: 1, stop: 297 } }]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [{ chain_id: 'B', residues: { start: 67, stop: 196 } }]
    }
  ]
}

describe('ExampleConstraints', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('asks for the given example', () => {
    mockUseQuery.mockReturnValue({ isLoading: true })
    render(<ExampleConstraints example="crd" />)
    expect(mockUseQuery).toHaveBeenCalledWith('crd')
    expect(
      screen.getByText(/Reading the example constraints/)
    ).toBeInTheDocument()
  })

  it('shows the example bodies read-only, with the schematic on offer', () => {
    mockUseQuery.mockReturnValue({ data: constraints, isLoading: false })
    render(<ExampleConstraints example="pdb" />)
    expect(
      screen.getByText(/The example uses these fixed and rigid bodies/)
    ).toBeInTheDocument()
    expect(screen.getByTestId('constraint-track-A')).toBeInTheDocument()
    expect(screen.getByTestId('constraint-track-B')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show schematic' })
    ).toBeInTheDocument()
    // Nothing to edit
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('falls back to a note when the constraints cannot be fetched', () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: true })
    render(<ExampleConstraints example="pdb" />)
    expect(
      screen.getByText(/The example's own fixed and rigid bodies will be used/)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('constraint-track-A')).toBeNull()
  })
})
