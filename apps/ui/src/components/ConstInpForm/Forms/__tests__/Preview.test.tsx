import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Formik } from 'formik'
import { renderWithProviders } from 'test/test-utils'
import { Preview } from '../Preview'

const chain = (id: string, last: number) => ({
  id,
  atoms: 1000,
  first_res: 1,
  last_res: last,
  num_res: last,
  type: 'PRO',
  domains: [{ start: 1, end: last }]
})

const renderPreview = (rigid_bodies: unknown[]) =>
  renderWithProviders(
    <Formik
      initialValues={{
        pdb_file: {
          file: null,
          src: null,
          name: 'model.pdb',
          chains: [chain('A', 300), chain('B', 120)],
          rigid_bodies
        }
      }}
      onSubmit={vi.fn()}
    >
      <Preview />
    </Formik>
  )

describe('Preview', () => {
  it('shows the schematic of the generated const.inp', async () => {
    renderPreview([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] },
      {
        id: 'RB1',
        domains: [
          { chainid: 'A', start: 120, end: 200 },
          { chainid: 'B', start: 20, end: 95 }
        ]
      }
    ])

    expect(
      await screen.findByText(/shape desc dock1 rigid/)
    ).toBeInTheDocument()
    const panel = await screen.findByTestId('const-inp-jiffy-schematic')
    expect(
      within(panel).getByText('How these constraints move')
    ).toBeInTheDocument()
    expect(
      within(panel)
        .getAllByTestId('schematic-body')
        .map((el) => el.getAttribute('data-kind'))
    ).toEqual(['fixed', 'rigid', 'tail'])
    expect(within(panel).getAllByTestId('schematic-bead')).toHaveLength(3)
    expect(
      within(panel).getByTestId('schematic-legend-rigid')
    ).toHaveTextContent('RigidBody1 · 2 segs · A+B')
  })

  it('shows no schematic when there are no bodies', async () => {
    renderPreview([])
    expect(await screen.findByText('return')).toBeInTheDocument()
    expect(screen.queryByTestId('const-inp-jiffy-schematic')).toBeNull()
  })
})
