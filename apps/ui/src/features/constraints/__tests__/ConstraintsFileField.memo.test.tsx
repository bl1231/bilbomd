import { describe, it, expect, vi } from 'vitest'
import { Field, Form, Formik } from 'formik'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ConstraintsInput, MDConstraintsDTO } from '@bilbomd/bilbomd-types'

// Records each constraints object the drawing is given
const drawn = vi.hoisted(() => [] as MDConstraintsDTO[])
vi.mock('features/results/components/MDConstraintsSection', () => ({
  MDConstraintsSection: ({
    constraints
  }: {
    constraints: MDConstraintsDTO
  }) => {
    drawn.push(constraints)
    return <div data-testid="drawn" />
  }
}))

import { ConstraintsFileField } from '../ConstraintsFileField'

const atom = (chain: string, resSeq: number) =>
  `ATOM      1  CA  ALA ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const pdb = new File(
  [Array.from({ length: 60 }, (_, i) => atom('A', i + 1)).join('\n')],
  'model.pdb'
)

describe('ConstraintsFileField drawing', () => {
  it('keeps the same constraints object across unrelated form edits', async () => {
    const user = userEvent.setup()
    render(
      <Formik
        initialValues={{
          constraints: null as ConstraintsInput | null,
          title: ''
        }}
        onSubmit={() => {}}
      >
        <Form>
          <Field
            name="title"
            aria-label="title"
          />
          <ConstraintsFileField
            name="constraints"
            mode="pdb"
            structureFile={pdb}
            engine="openmm"
          />
        </Form>
      </Formik>
    )
    await user.upload(
      screen.getByTestId('constraints-file-input'),
      new File(
        [
          'define f sele ( resid 1:30 .and. segid PROA ) end\ncons fix sele f end\nreturn'
        ],
        'const.inp'
      )
    )
    await screen.findByTestId('drawn')
    await user.type(screen.getByLabelText('title'), 'abc')
    await waitFor(() => expect(drawn.length).toBeGreaterThan(1))
    expect(new Set(drawn).size).toBe(1)
  })
})
