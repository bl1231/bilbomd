import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { renderWithProviders } from 'test/test-utils'

const here = path.dirname(fileURLToPath(import.meta.url))
// What the server's pae2const.py run returns for the AlphaFold example
const paeConstInp = readFileSync(
  path.join(
    here,
    '../../constraints/__tests__/fixtures/example-auto-pae2const.inp'
  ),
  'utf8'
)
const examplePdb = readFileSync(
  path.join(here, '../../../../../../example-data/auto/example-auto.pdb'),
  'utf8'
)

const submit = vi.hoisted(() => vi.fn())
vi.mock('slices/jobsApiSlice', () => ({
  useAf2PaeJiffyMutation: () => [
    (form: FormData) => {
      submit(form)
      return { unwrap: async () => ({ uuid: 'run-1' }) }
    },
    { error: null, isError: false }
  ],
  useGetAf2PaeStatusQuery: (uuid: string) => ({
    data: uuid ? { status: 'completed' } : undefined,
    isError: false
  }),
  useGetAf2PaeConstFileQuery: (uuid: string, { skip }: { skip: boolean }) => ({
    data: skip || !uuid ? undefined : paeConstInp,
    error: undefined,
    isLoading: false
  })
}))
vi.mock('slices/alphafoldPaeVizSlice', () => ({
  useGetVizJsonQuery: () => ({ data: undefined, isSuccess: false }),
  useGetPaeBinQuery: () => ({ data: undefined, isSuccess: false }),
  useGetVizPngQuery: () => ({ data: undefined, isSuccess: false })
}))
// Canvas plots aren't what this test is about
vi.mock('../PAEMatrixPlot', () => ({ default: () => null }))
vi.mock('../PLDDTPlot', () => ({ default: () => null }))

import PAEJiffy from '../PAEJiffy'

const pick = (id: string, file: File) => {
  const input = document.getElementById(id) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('PAEJiffy', () => {
  it('starts with the instructions open, and talks about constraints, not CHARMM', () => {
    renderWithProviders(<PAEJiffy />)
    expect(
      screen.getByRole('button', { name: /instructions/i })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('Create Constraints from AlphaFold PAE')
    ).toBeInTheDocument()
    expect(screen.queryByText(/CHARMM-compat/)).toBeNull()
  })

  it('shows a finished run the way the Inp Jiffy shows its result', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PAEJiffy />)
    // One at a time, as a person picks them: picks in the same instant race
    // Formik's async checks
    pick('pdb-file-upload', new File([examplePdb], 'example-auto.pdb'))
    await screen.findByText('example-auto.pdb')
    await waitFor(() =>
      expect(screen.queryByText('Structure file is required')).toBeNull()
    )
    pick(
      'pae-file-upload',
      new File(['{"pae": []}'], 'example-auto-pae.json', {
        type: 'application/json'
      })
    )
    await screen.findByText('example-auto-pae.json')
    const submitButton = await screen.findByRole('button', { name: /submit/i })
    await waitFor(() => expect(submitButton).toBeEnabled())
    await user.click(submitButton)

    const summary = await screen.findByTestId('pae-jiffy-summary')
    expect(summary).toHaveTextContent('Constraints created')
    expect(summary).toHaveTextContent('Rigid bodies (max 20)')
    expect(summary).not.toHaveTextContent('CHARMM')

    // Checked against the model, then drawn, with both files and the hand-off
    expect(await screen.findByTestId('jiffy-constraints')).toHaveTextContent(
      'RigidBody1'
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Download openmm_const.yml/ })
      ).toBeEnabled()
    )
    expect(
      screen.getByRole('button', { name: /Download const.inp/ })
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: /Use in a new Classic job/ })
    ).toBeEnabled()
    expect(screen.getByTestId('const-inp-text')).toHaveTextContent(
      'shape desc dock1 rigid sele rigid1 end'
    )
    expect(submit).toHaveBeenCalledTimes(1)
  })
})
