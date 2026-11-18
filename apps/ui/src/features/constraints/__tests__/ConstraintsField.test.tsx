import { describe, it, expect, vi } from 'vitest'
import { Form, Formik } from 'formik'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConstraintsInput } from '@bilbomd/bilbomd-types'
import { ConstraintsField } from '../ConstraintsField'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const pdb = new File(
  [Array.from({ length: 50 }, (_, i) => atom('A', 'ALA', i + 1)).join('\n')],
  'model.pdb'
)

const renderField = (props: {
  structureFile: File | string
  initialFor?: () => ConstraintsInput | null
  onSubmit?: (values: { constraints: ConstraintsInput | null }) => void
}) =>
  render(
    <Formik
      initialValues={{ constraints: null as ConstraintsInput | null }}
      onSubmit={props.onSubmit ?? (() => {})}
    >
      <Form>
        <ConstraintsField
          name="constraints"
          mode="pdb"
          engine="charmm"
          structureFile={props.structureFile}
          initialFor={props.initialFor}
        />
        <button type="submit">Submit</button>
      </Form>
    </Formik>
  )

describe('ConstraintsField', () => {
  it('asks for a structure file first', () => {
    renderField({ structureFile: '' })
    expect(screen.getByText(/Select a PDB or CIF file/)).toBeInTheDocument()
  })

  it('starts with every segment fixed once the structure is read', async () => {
    renderField({ structureFile: pdb })
    expect(await screen.findByTestId('const-inp-preview')).toHaveTextContent(
      'define fixed1 sele ( segid PROA ) end'
    )
  })

  it('starts from given constraints for the first structure', async () => {
    renderField({
      structureFile: pdb,
      initialFor: () => ({
        fixed_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 1, stop: 9 } }] }
        ]
      })
    })
    expect(await screen.findByTestId('const-inp-preview')).toHaveTextContent(
      'resid 1:9 .and. segid PROA'
    )
  })

  it('blocks submission while the constraints are invalid', async () => {
    const onSubmit = vi.fn()
    renderField({
      structureFile: pdb,
      onSubmit,
      initialFor: () => ({
        fixed_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 60, stop: 70 } }] }
        ]
      })
    })
    expect(await screen.findByTestId('constraints-errors')).toHaveTextContent(
      'has no residues in 60-70'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits valid constraints', async () => {
    const onSubmit = vi.fn()
    renderField({ structureFile: pdb, onSubmit })
    await screen.findByTestId('const-inp-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          constraints: { fixed_bodies: [{ segments: [{ chain_id: 'A' }] }] }
        },
        expect.anything()
      )
    )
  })
})
