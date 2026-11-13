import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Formik, useFormikContext } from 'formik'
import { renderWithProviders } from 'test/test-utils'
import UploadForm from '../UploadForm'
import initialValues from '../../FormModel/formInitialValues'
import validationSchemas from '../../FormModel/validationSchemas'
import type { RigidBody } from 'types/interfaces'

const renderUploadForm = () =>
  renderWithProviders(
    <Formik
      initialValues={initialValues}
      onSubmit={vi.fn()}
    >
      <UploadForm setStepIsValid={vi.fn()} />
    </Formik>
  )

describe('UploadForm instructions', () => {
  it('links to the c51b1 CHARMM atom selection docs', () => {
    renderUploadForm()

    expect(
      screen.getByRole('link', { name: /atom selection/i, hidden: true })
    ).toHaveAttribute(
      'href',
      'https://academiccharmm.org/documentation/version/c51b1/select'
    )
  })

  it('gives every define in the example const.inp its own name', () => {
    renderUploadForm()

    const example = screen.getByText(/shape desc dock1/).textContent ?? ''
    const names = [...example.matchAll(/define\s+(\w+)\s+sele/g)].map(
      ([, name]) => name
    )

    expect(names).toEqual(['fixed1', 'fixed2', 'rigid1', 'rigid2'])
    expect(example).toContain('shape desc dock1 rigid sele rigid1 end')
    expect(example).toContain('shape desc dock2 rigid sele rigid2 end')
  })
})

// One CA atom per residue, in PDB columns
const atom = (serial: number, chain: string, resSeq: number) =>
  `ATOM  ${String(serial).padStart(5)}  CA  ALA ${chain}${String(resSeq).padStart(4)}    ` +
  `   1.000   2.000   3.000  1.00  0.00           C`

const pdbText = () => {
  const lines: string[] = []
  for (let r = 1; r <= 100; r++) lines.push(atom(r, 'A', r))
  for (let r = 1; r <= 50; r++) lines.push(atom(100 + r, 'B', r))
  return lines.join('\n') + '\nEND\n'
}

const constInpText = `* from an earlier run
define fixed1 sele ( resid 1:40 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid 5:45 .and. segid PROB ) end
shape desc dock1 rigid sele rigid1 end
cons harm force 5.0 sele fixed1 end
return
`

const RigidBodies = () => {
  const { values } = useFormikContext<{
    pdb_file: { rigid_bodies: RigidBody[] }
  }>()
  return (
    <pre data-testid="rigid-bodies">
      {JSON.stringify(values.pdb_file.rigid_bodies)}
    </pre>
  )
}

const renderWithBodies = () =>
  renderWithProviders(
    <Formik
      initialValues={initialValues}
      validationSchema={validationSchemas[0]}
      onSubmit={vi.fn()}
    >
      <>
        <UploadForm setStepIsValid={vi.fn()} />
        <RigidBodies />
      </>
    </Formik>
  )

const upload = (id: string, name: string, text: string) => {
  const input = document.getElementById(id) as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File([text], name, { type: 'text/plain' })] }
  })
}

// Empty until the PDB has been read
const rigidBodies = () =>
  JSON.parse(
    screen.getByTestId('rigid-bodies').textContent || '[]'
  ) as RigidBody[]

describe('UploadForm with an existing const.inp', () => {
  it('starts from whole chains without one', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())

    await waitFor(() =>
      expect(rigidBodies()).toEqual([
        {
          id: 'PRIMARY',
          domains: [
            { chainid: 'A', start: 1, end: 100 },
            { chainid: 'B', start: 1, end: 50 }
          ]
        }
      ])
    )
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })

  it('takes its bodies and says what it left out', async () => {
    renderWithBodies()
    upload('const_inp_file', 'const.inp', constInpText)
    expect(
      await screen.findByText(/Upload the PDB file to check/)
    ).toBeInTheDocument()

    upload('pdb_file', 'model.pdb', pdbText())

    await waitFor(() =>
      expect(rigidBodies()).toEqual([
        { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 40 }] },
        { id: 'RIGID 1', domains: [{ chainid: 'B', start: 5, end: 45 }] }
      ])
    )
    const notes = await screen.findByTestId('const-inp-import-notes')
    expect(notes).toHaveTextContent('1 thing to check')
    expect(notes).toHaveTextContent('cons harm force 5.0 sele fixed1 end')
  })

  it('goes back to whole chains when the const.inp is removed', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())
    upload('const_inp_file', 'const.inp', constInpText)
    await waitFor(() => expect(rigidBodies()).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(rigidBodies()).toHaveLength(1))
    expect(rigidBodies()[0]?.domains).toHaveLength(2)
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })

  it('rejects a file with no bodies it can read', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())
    await waitFor(() => expect(rigidBodies()).toHaveLength(1))
    upload('const_inp_file', 'notes.txt', 'just some text\nreturn\n')

    expect(
      await screen.findByText(
        'No fixed or rigid bodies could be read from this file.'
      )
    ).toBeInTheDocument()
    // Still the whole chains, not an empty PRIMARY
    expect(rigidBodies()).toEqual([
      {
        id: 'PRIMARY',
        domains: [
          { chainid: 'A', start: 1, end: 100 },
          { chainid: 'B', start: 1, end: 50 }
        ]
      }
    ])
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })
})

describe('UploadForm const.inp reads', () => {
  const otherInp = `define fixed1 sele ( resid 10:20 .and. segid PROA ) end
cons fix sele fixed1 end
return
`

  it('ignores a read that finishes after Remove', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())
    await waitFor(() => expect(rigidBodies()).toHaveLength(1))

    upload('const_inp_file', 'const.inp', constInpText)
    // Before the FileReader is done
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    // Long enough for the dropped read to have finished
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(rigidBodies()).toHaveLength(1)
    expect(rigidBodies()[0]?.domains).toHaveLength(2)
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })

  it('uses the newest pick when an older read finishes later', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())
    await waitFor(() => expect(rigidBodies()).toHaveLength(1))

    upload('const_inp_file', 'first.inp', constInpText)
    upload('const_inp_file', 'second.inp', otherInp)

    await waitFor(() =>
      expect(rigidBodies()).toEqual([
        { id: 'PRIMARY', domains: [{ chainid: 'A', start: 10, end: 20 }] }
      ])
    )
    // Long enough for the dropped read to have finished
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(rigidBodies()).toHaveLength(1)
  })

  it('rejects an empty file', async () => {
    renderWithBodies()
    upload('pdb_file', 'model.pdb', pdbText())
    await waitFor(() => expect(rigidBodies()).toHaveLength(1))
    upload('const_inp_file', 'empty.inp', '')

    expect(
      await screen.findByText(
        'No fixed or rigid bodies could be read from this file.'
      )
    ).toBeInTheDocument()
  })
})
