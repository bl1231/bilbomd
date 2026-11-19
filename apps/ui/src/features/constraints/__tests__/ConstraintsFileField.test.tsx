import { describe, it, expect } from 'vitest'
import { Form, Formik, useFormikContext } from 'formik'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import type { ConstraintMode, ConstraintsInput } from '@bilbomd/bilbomd-types'
import { ConstraintsFileField, type JiffyLinks } from '../ConstraintsFileField'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const pdb = new File(
  [
    [
      ...Array.from({ length: 100 }, (_, i) => atom('A', 'ALA', i + 1)),
      ...Array.from({ length: 80 }, (_, i) => atom('B', 'ALA', i + 1))
    ].join('\n')
  ],
  'model.pdb'
)

const constInp = (name: string, ...lines: string[]) =>
  new File([[...lines, 'return'].join('\n')], name)

const goodInp = constInp(
  'const.inp',
  'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
  'cons fix sele fixed1 end',
  'define rigid1 sele ( resid 10:80 .and. segid PROB ) end',
  'shape desc dock1 rigid sele rigid1 end'
)

// Shows the Formik value and error, so tests can check what is submitted
const State = () => {
  const { values, errors } = useFormikContext<{
    constraints: ConstraintsInput | null
  }>()
  return (
    <>
      <pre data-testid="value">{JSON.stringify(values.constraints)}</pre>
      <pre data-testid="error">{errors.constraints ?? ''}</pre>
    </>
  )
}

const Harness = ({
  structure,
  mode = 'pdb',
  engine = 'charmm',
  jiffyLinks
}: {
  structure: File | string
  mode?: ConstraintMode
  engine?: 'charmm' | 'openmm'
  jiffyLinks?: JiffyLinks
}) => (
  <Formik
    initialValues={{ constraints: null as ConstraintsInput | null }}
    onSubmit={() => {}}
  >
    <Form>
      <ConstraintsFileField
        name="constraints"
        mode={mode}
        structureFile={structure}
        engine={engine}
        jiffyLinks={jiffyLinks}
      />
      <State />
    </Form>
  </Formik>
)

const pick = async (file: File) => {
  const user = userEvent.setup()
  await user.upload(screen.getByTestId('constraints-file-input'), file)
  return user
}

describe('ConstraintsFileField', () => {
  it('asks for a file, pointing to the Jiffys, with no editor', () => {
    render(<Harness structure="" />)
    expect(screen.getByText('constraints')).toBeInTheDocument()
    expect(screen.getByTestId('constraints-file-help')).toHaveTextContent(
      "with this job's fixed and rigid bodies"
    )
    expect(screen.getByRole('link', { name: /Inp Jiffy/ })).toHaveAttribute(
      'href',
      '/dashboard/jobs/constinp'
    )
    expect(screen.getByRole('link', { name: /PAE Jiffy/ })).toHaveAttribute(
      'href',
      '/dashboard/af2pae'
    )
    expect(screen.getByRole('link', { name: /Inp Jiffy/ })).toHaveAttribute(
      'target',
      '_blank'
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('links to the public Jiffys for anonymous users', () => {
    render(
      <Harness
        structure=""
        jiffyLinks="public"
      />
    )
    expect(screen.getByRole('link', { name: /Inp Jiffy/ })).toHaveAttribute(
      'href',
      '/jiffy/inp'
    )
    expect(screen.getByRole('link', { name: /PAE Jiffy/ })).toHaveAttribute(
      'href',
      '/jiffy/pae'
    )
  })

  it('waits for the structure before checking the file', async () => {
    render(<Harness structure="" />)
    await pick(goodInp)
    expect(
      await screen.findByText(/checked once the PDB or CIF file is selected/)
    ).toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('null')
  })

  it('draws the constraints once both files are picked, and sets the value', async () => {
    render(<Harness structure={pdb} />)
    await pick(goodInp)
    const preview = await screen.findByTestId('constraints-file-preview')
    expect(preview).toHaveTextContent('The fixed and rigid bodies in const.inp')
    expect(screen.getByTestId('constraint-track-A')).toBeInTheDocument()
    expect(screen.getByTestId('constraint-track-B')).toBeInTheDocument()
    expect(screen.getByTestId('const-inp-preview')).toHaveTextContent(
      'resid 10:80 .and. segid PROB'
    )
    await waitFor(() =>
      expect(
        JSON.parse(screen.getByTestId('value').textContent ?? 'null')
      ).toEqual({
        fixed_bodies: [
          {
            segments: [
              {
                chain_id: 'A',
                segid: 'PROA',
                residues: { start: 1, stop: 100 }
              }
            ]
          }
        ],
        rigid_bodies: [
          {
            segments: [
              {
                chain_id: 'B',
                segid: 'PROB',
                residues: { start: 10, stop: 80 }
              }
            ]
          }
        ]
      })
    )
  })

  it('checks the file whichever is picked first', async () => {
    const { rerender } = render(<Harness structure="" />)
    await pick(goodInp)
    rerender(<Harness structure={pdb} />)
    expect(
      await screen.findByTestId('constraints-file-preview')
    ).toBeInTheDocument()
  })

  it('shows no const.inp for OpenMM jobs', async () => {
    render(
      <Harness
        structure={pdb}
        engine="openmm"
      />
    )
    await pick(goodInp)
    await screen.findByTestId('constraints-file-preview')
    expect(screen.queryByTestId('const-inp-preview')).toBeNull()
  })

  it('refuses a file with parts that would be left out', async () => {
    render(<Harness structure={pdb} />)
    await pick(
      constInp(
        'bad.inp',
        'define fixed1 sele ( resid 1:100 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'system "id"'
      )
    )
    expect(
      await screen.findByTestId('constraints-file-problems')
    ).toHaveTextContent('Left out: system "id"')
    expect(screen.queryByTestId('constraints-file-preview')).toBeNull()
    expect(screen.getByTestId('value')).toHaveTextContent('null')
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'cannot be used as it is'
      )
    )
  })

  it('lists what doesn’t fit the structure', async () => {
    render(<Harness structure={pdb} />)
    await pick(
      constInp(
        'other.inp',
        'define fixed1 sele ( resid 1:50 .and. segid PROC ) end',
        'cons fix sele fixed1 end'
      )
    )
    // PROC is not in the structure
    expect(
      await screen.findByText(/don.t fit this structure|holds no usable/)
    ).toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('null')
  })

  it('asks which cons fix is the fixed body', async () => {
    render(<Harness structure={pdb} />)
    const user = await pick(
      constInp(
        'two-fix.inp',
        'define a sele ( resid 1:10 .and. segid PROA ) end',
        'define b sele ( resid 20:30 .and. segid PROA ) end',
        'cons fix sele a end',
        'cons fix sele b end'
      )
    )
    await screen.findByTestId('fixed-body-choice')
    expect(screen.getByTestId('value')).toHaveTextContent('null')
    await user.click(
      screen.getByRole('button', { name: /cons fix #2: PROA 20–30/ })
    )
    expect(await screen.findByTestId('const-inp-preview')).toHaveTextContent(
      'resid 20:30 .and. segid PROA'
    )
  })

  it('starts over when the mode changes', async () => {
    const { rerender } = render(<Harness structure={pdb} />)
    await pick(goodInp)
    await screen.findByTestId('constraints-file-preview')
    rerender(
      <Harness
        structure=""
        mode="crd_psf"
      />
    )
    await waitFor(() => expect(screen.queryByText('const.inp')).toBeNull())
    expect(screen.getByTestId('value')).toHaveTextContent('null')
  })
})
