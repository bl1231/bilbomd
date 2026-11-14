import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { Formik } from 'formik'
import { renderWithProviders } from 'test/test-utils'
import DomainForm from '../DomainForm'
import validationSchemas from '../../FormModel/validationSchemas'
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
  it('shows what the const.inp import found', async () => {
    renderDomainForm(
      [{ id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }],
      ['segid PROZ matches no chain in the PDB, so resid 1:50 was left out.']
    )
    expect(
      await screen.findByTestId('const-inp-import-notes')
    ).toHaveTextContent('segid PROZ matches no chain')
    // Let the check on entering the step finish
    await waitFor(() =>
      expect(screen.getAllByText(/^Rigid Body:/)).toHaveLength(1)
    )
  })

  it('shows no import notes without a const.inp', async () => {
    renderDomainForm([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }
    ])
    await waitFor(() =>
      expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
    )
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

const renderValidated = (rigid_bodies: RigidBody[]) => {
  const setStepIsValid = vi.fn()
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
        const_inp_file: { file: null, src: null, name: '', notes: null }
      }}
      validationSchema={validationSchemas[1]}
      onSubmit={vi.fn()}
    >
      <DomainForm setStepIsValid={setStepIsValid} />
    </Formik>
  )
  return setStepIsValid
}

describe('DomainForm checks the bodies on entering the step', () => {
  it('keeps Next off and shows the error for an imported out-of-range segment', async () => {
    const setStepIsValid = renderValidated([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 250, end: 350 }] }
    ])
    expect(setStepIsValid).toHaveBeenCalledWith(false)
    expect(
      await screen.findByText(
        'Please choose number between chain start and end residue'
      )
    ).toBeInTheDocument()
    expect(setStepIsValid).not.toHaveBeenCalledWith(true)
  })

  it('asks for a PRIMARY segment when the import had none', async () => {
    const setStepIsValid = renderValidated([
      { id: 'PRIMARY', domains: [] },
      { id: 'RIGID 1', domains: [{ chainid: 'A', start: 10, end: 50 }] }
    ])
    expect(
      await screen.findByText(/PRIMARY needs at least one fixed segment/)
    ).toBeInTheDocument()
    expect(setStepIsValid).not.toHaveBeenCalledWith(true)
  })

  it('turns Next on once valid bodies have been checked', async () => {
    const setStepIsValid = renderValidated([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] }
    ])
    expect(setStepIsValid).toHaveBeenNthCalledWith(1, false)
    await waitFor(() => expect(setStepIsValid).toHaveBeenLastCalledWith(true))
  })
})
