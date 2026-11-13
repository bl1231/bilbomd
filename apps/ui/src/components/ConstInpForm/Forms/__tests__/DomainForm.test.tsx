import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { Formik } from 'formik'
import { renderWithProviders } from 'test/test-utils'
import DomainForm from '../DomainForm'
import type { RigidBody } from 'types/interfaces'

const chainA = {
  id: 'A',
  atoms: 300,
  first_res: 1,
  last_res: 300,
  num_res: 300,
  type: 'PRO',
  domains: [{ start: 1, end: 300 }]
}

const renderDomainForm = (
  rigid_bodies: RigidBody[],
  notes: string[] | null = null
) =>
  renderWithProviders(
    <Formik
      initialValues={{
        pdb_file: {
          file: 'model.pdb',
          src: 'ATOM',
          name: 'model.pdb',
          chains: [chainA],
          rigid_bodies
        },
        const_inp_file: { file: null, src: null, name: 'const.inp', notes }
      }}
      onSubmit={vi.fn()}
    >
      <DomainForm setStepIsValid={vi.fn()} />
    </Formik>
  )

const bodyIds = () =>
  screen
    .getAllByText(/^Rigid Body:/)
    .map((el) => within(el).getByText(/PRIMARY|RIGID/).textContent)

describe('DomainForm', () => {
  it('shows what the const.inp import found', () => {
    renderDomainForm(
      [{ id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }],
      ['segid PROZ matches no chain in the PDB, so resid 1:50 was left out.']
    )
    expect(screen.getByTestId('const-inp-import-notes')).toHaveTextContent(
      'segid PROZ matches no chain'
    )
  })

  it('shows no import notes without a const.inp', () => {
    renderDomainForm([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }
    ])
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })

  it('gives an added rigid body an ID no imported body has', async () => {
    renderDomainForm([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] },
      { id: 'RIGID 1', domains: [{ chainid: 'A', start: 110, end: 150 }] },
      { id: 'RIGID 2', domains: [{ chainid: 'A', start: 160, end: 200 }] }
    ])
    fireEvent.click(screen.getByRole('button', { name: /Add Rigid Body/ }))
    await waitFor(() =>
      expect(bodyIds()).toEqual(['PRIMARY', 'RIGID 1', 'RIGID 2', 'RIGID 3'])
    )
  })
})
