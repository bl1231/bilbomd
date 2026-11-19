import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('features/mwcheck/MwCheck', () => ({ default: () => null }))
vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewJobMutation: () => [vi.fn(), { isSuccess: false }],
  useCalculateAutoRgMutation: () => [vi.fn(), { isLoading: false }]
}))
vi.mock('../../../slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [vi.fn(), { isSuccess: false }],
  useGetClassicExampleConstraintsQuery: () => ({ isLoading: true })
}))
vi.mock('../../../slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: { useNersc: 'false' }, isLoading: false })
}))

import NewJobForm from '../NewJobForm'

const atom = (chain: string, resSeq: number) =>
  `ATOM      1  CA  ALA ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const structure = new File(
  [
    [
      ...Array.from({ length: 100 }, (_, i) => atom('A', i + 1)),
      ...Array.from({ length: 60 }, (_, i) => atom('B', i + 1))
    ].join('\n')
  ],
  'model.pdb'
)
const constraints = new File(
  [
    [
      'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
      'cons fix sele fixed1 end',
      'define rigid1 sele ( resid 5:55 .and. segid PROB ) end',
      'shape desc dock1 rigid sele rigid1 end',
      'return'
    ].join('\n')
  ],
  'const.inp'
)

// Shows the history state, to check the form clears it
const StateProbe = () => {
  const location = useLocation()
  return <pre data-testid="state">{JSON.stringify(location.state)}</pre>
}

const renderWith = (state: unknown) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/dashboard/jobs/classic', state }]}
    >
      <NewJobForm />
      <StateProbe />
    </MemoryRouter>
  )

describe('NewJobForm hand-off from a Jiffy', () => {
  it('starts from the handed-over structure and constraints', async () => {
    renderWith({
      classicHandoff: { structure, constraints, from: 'the Inp Jiffy™' }
    })
    expect(screen.getByTestId('classic-handoff')).toHaveTextContent(
      'Started from the Inp Jiffy™, with model.pdb and const.inp'
    )
    // The structure picker shows the file, and the constraints are checked
    // against it and drawn
    expect(screen.getAllByText('model.pdb').length).toBeGreaterThan(0)
    expect(
      await screen.findByTestId('constraints-file-preview')
    ).toHaveTextContent('The fixed and rigid bodies in const.inp')
    expect(screen.getByTestId('constraint-track-B')).toBeInTheDocument()
    // Cleared, so going back or reloading starts a plain form
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('null')
    )
  })

  it('is a plain form without one', () => {
    renderWith(null)
    expect(screen.queryByTestId('classic-handoff')).toBeNull()
    expect(screen.queryByTestId('constraints-file-preview')).toBeNull()
  })

  it('ignores state that is not a hand-off', () => {
    renderWith({ classicHandoff: { structure: 'model.pdb' } })
    expect(screen.queryByTestId('classic-handoff')).toBeNull()
  })
})
