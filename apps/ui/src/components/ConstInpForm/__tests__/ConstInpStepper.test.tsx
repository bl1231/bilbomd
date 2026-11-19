import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from 'test/test-utils'
import ConstInpStepper from '../ConstInpStepper'

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

const upload = (id: string, name: string, text: string) => {
  const input = document.getElementById(id) as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File([text], name, { type: 'text/plain' })] }
  })
}

const buttons = (name: string | RegExp) =>
  screen.queryAllByRole('button', { name })
// The step's icon is a check once it is completed
const stepCompleted = (label: string) =>
  within(document.querySelector('.MuiStepper-root') as HTMLElement)
    .getByText(label)
    .closest('.MuiStep-root')
    ?.querySelector('.MuiStepIcon-root')
    ?.classList.contains('Mui-completed') ?? false

// From step 1 with a PDB to the last step
// Next turns on once the step's checks have run; Formik checks again as a
// step settles, so wait for its content first
const next = async (
  user: ReturnType<typeof userEvent.setup>,
  settled: () => Promise<unknown>
) => {
  await settled()
  await waitFor(() => expect(buttons('Next')[0]).toBeEnabled())
  await user.click(buttons('Next')[0]!)
}

const toLastStep = async (user: ReturnType<typeof userEvent.setup>) => {
  upload('pdb_file', 'model.pdb', pdbText())
  await next(user, () => screen.findByText('Chain ID: B'))
  await next(user, () => screen.findByText(/^Fixed Body:/))
  await screen.findByTestId('jiffy-constraints')
}

describe('ConstInpStepper', () => {
  let click: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    Object.assign(window.URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn()
    })
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
  })
  afterEach(() => {
    click.mockRestore()
  })

  it('ends on the preview, with Start Over instead of Finish', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    await toLastStep(user)
    expect(buttons('Finish')).toHaveLength(0)
    expect(buttons('Next')).toHaveLength(0)
    // Above and below the step
    expect(buttons(/Start Over/)).toHaveLength(2)
    expect(screen.queryByText(/Woot/)).toBeNull()
  })

  it('marks the last step completed once a file is downloaded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    await toLastStep(user)
    expect(stepCompleted('Preview & Download')).toBe(false)

    await user.click(buttons(/Download const.inp/)[0]!)
    expect(stepCompleted('Preview & Download')).toBe(true)

    // Changing the bodies makes the download stale
    await user.click(buttons('Back')[0]!)
    await next(user, () => screen.findByText(/^Fixed Body:/))
    await screen.findByTestId('jiffy-constraints')
    expect(stepCompleted('Preview & Download')).toBe(false)
  })

  it('starts over at step 1 with nothing picked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    await toLastStep(user)
    await user.click(buttons(/Download openmm_const.yml/)[0]!)
    await user.click(buttons(/Start Over/)[0]!)

    expect(await screen.findByText('Select PDB File')).toBeInTheDocument()
    expect(screen.queryByText('model.pdb')).toBeNull()
    expect(buttons('Next')[0]).toBeDisabled()
    expect(stepCompleted('Preview & Download')).toBe(false)
  })

  it('starts on step 1 with Next off until a PDB is read', async () => {
    renderWithProviders(<ConstInpStepper />)
    expect(document.title).toBe('BilboMD: Upload PDB file')
    // The same buttons above and below the step
    expect(buttons('Back')).toHaveLength(2)
    expect(buttons('Next')).toHaveLength(2)
    buttons('Back').forEach((b) => expect(b).toBeDisabled())
    buttons('Next').forEach((b) => expect(b).toBeDisabled())

    upload('pdb_file', 'model.pdb', pdbText())
    await screen.findByText('Chain ID: B')
    await waitFor(() => buttons('Next').forEach((b) => expect(b).toBeEnabled()))
  })

  it('keeps Next off for a file with no atoms', async () => {
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'notes.pdb', 'HEADER    nothing here\nEND\n')
    expect(
      await screen.findByText(/No ATOM\/HETATM records found/)
    ).toBeInTheDocument()
    // Still off, with the reason shown, after the form checks again
    await new Promise((r) => setTimeout(r, 300))
    expect(buttons('Next')[0]).toBeDisabled()
    expect(
      screen.getByText(/No ATOM\/HETATM records found/)
    ).toBeInTheDocument()
  })

  it('keeps Next off for atoms without a chain ID', async () => {
    renderWithProviders(<ConstInpStepper />)
    const noChain = `ATOM      1  CA  ALA    1       1.000   2.000   3.000  1.00  0.00           C\nEND\n`
    upload('pdb_file', 'nochain.pdb', noChain)
    expect(
      await screen.findByText(/do not have a chain ID/)
    ).toBeInTheDocument()
    // Still off after the form checks again
    await new Promise((r) => setTimeout(r, 300))
    expect(buttons('Next')[0]).toBeDisabled()
    expect(screen.getByText(/do not have a chain ID/)).toBeInTheDocument()
  })

  it('moves through the steps, marking the ones done', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'model.pdb', pdbText())
    await next(user, () => screen.findByText('Chain ID: B'))

    await screen.findByText(/^Fixed Body:/)
    expect(document.title).toBe('BilboMD: Define fixed and rigid bodies')
    expect(stepCompleted('Upload Files')).toBe(true)
    expect(stepCompleted('Define Fixed and Rigid Bodies')).toBe(false)
    expect(buttons('Back')[0]).toBeEnabled()

    await next(user, () => screen.findByText(/^Fixed Body:/))
    await screen.findByTestId('jiffy-constraints')
    expect(document.title).toBe('BilboMD: Preview constraints')
    expect(stepCompleted('Define Fixed and Rigid Bodies')).toBe(true)
    // By default every chain is in the fixed body
    expect(screen.getByTestId('jiffy-constraints')).toHaveTextContent(
      'FixedBody1'
    )
  })

  it('keeps the PDB when going back to step 1', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'model.pdb', pdbText())
    await next(user, () => screen.findByText('Chain ID: B'))
    await screen.findByText(/^Fixed Body:/)
    await user.click(buttons('Back')[0]!)

    expect(await screen.findByText('model.pdb')).toBeInTheDocument()
    expect(screen.getByText('Chain ID: A')).toBeInTheDocument()
    await waitFor(() => expect(buttons('Next')[0]).toBeEnabled())
  })

  it('keeps Next off on step 2 while a segment is out of range', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'model.pdb', pdbText())
    await next(user, () => screen.findByText('Chain ID: B'))
    await screen.findByText(/^Fixed Body:/)

    // Chain A has residues 1–100
    const end = document.querySelector(
      'input[name="pdb_file.rigid_bodies[0].domains[0].end"]'
    ) as HTMLInputElement
    await user.clear(end)
    await user.type(end, '500')
    await waitFor(() => expect(buttons('Next')[0]).toBeDisabled())

    await user.clear(end)
    await user.type(end, '90')
    await waitFor(() => expect(buttons('Next')[0]).toBeEnabled())
  })

  it('starts from a constraints file and carries its bodies through', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'model.pdb', pdbText())
    upload(
      'const_inp_file',
      'openmm_const.yml',
      [
        'constraints:',
        '  fixed_bodies:',
        '    - segments:',
        '        - chain_id: A',
        '          residues: { start: 1, stop: 40 }',
        '  rigid_bodies:',
        '    - segments:',
        '        - chain_id: B',
        '          residues: { start: 5, stop: 45 }'
      ].join('\n')
    )
    await next(user, async () =>
      expect(
        await screen.findByTestId('const-inp-import-notes')
      ).toHaveTextContent('Every body in openmm_const.yml matches the PDB')
    )
    expect(await screen.findByText(/^Rigid Body:/)).toBeInTheDocument()

    await next(user, () => screen.findByText(/^Rigid Body:/))
    const drawn = await screen.findByTestId('jiffy-constraints')
    expect(drawn).toHaveTextContent('RigidBody1')
    expect(drawn).toHaveTextContent('B 5–45')
  })

  it('forgets the constraints file too on Start Over', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConstInpStepper />)
    upload('pdb_file', 'model.pdb', pdbText())
    upload(
      'const_inp_file',
      'const.inp',
      'define f sele ( resid 1:40 .and. segid PROA ) end\ncons fix sele f end\nreturn\n'
    )
    await next(user, async () =>
      expect(
        await screen.findByTestId('const-inp-import-notes')
      ).toHaveTextContent('Every body in const.inp')
    )
    await next(user, () => screen.findByText(/^Fixed Body:/))
    await screen.findByTestId('jiffy-constraints')
    await user.click(buttons(/Start Over/)[0]!)

    await screen.findByText('Select PDB File')
    // No picked file shows, and there is no file to remove
    expect(
      screen
        .queryAllByRole('alert')
        .filter((a) => a.textContent === 'const.inp')
    ).toHaveLength(0)
    expect(buttons('Remove')).toHaveLength(0)
  })
})
