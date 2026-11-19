import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Formik } from 'formik'
import { parse } from 'yaml'
import {
  importConstraintsFromConstInp,
  importConstraintsFromData,
  readPdbSegments
} from '@bilbomd/bilbomd-types'
import { renderWithProviders } from 'test/test-utils'

const startClassicJob = vi.hoisted(() => vi.fn())
vi.mock('features/constraints/classicHandoff', () => ({
  useStartClassicJob: () => startClassicJob
}))

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

const atom = (chainId: string, resSeq: number) =>
  `ATOM      1  CA  ALA ${chainId}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const pdbText = [
  ...Array.from({ length: 300 }, (_, i) => atom('A', i + 1)),
  ...Array.from({ length: 120 }, (_, i) => atom('B', i + 1))
].join('\n')
const pdbFile = new File([pdbText], 'model.pdb')

const renderPreview = (rigid_bodies: unknown[]) =>
  renderWithProviders(
    <Formik
      initialValues={{
        pdb_file: {
          file: pdbFile,
          src: pdbText,
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

const twoBodies = [
  { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] },
  {
    id: 'RIGID 1',
    domains: [
      { chainid: 'A', start: 120, end: 200 },
      { chainid: 'B', start: 20, end: 95 }
    ]
  }
]

const button = (name: RegExp) => screen.getByRole('button', { name })

describe('Preview', () => {
  beforeEach(() => {
    startClassicJob.mockReset()
  })

  it('draws the bodies the way the job form and job page do', async () => {
    renderPreview(twoBodies)
    const drawn = await screen.findByTestId('jiffy-constraints')
    expect(drawn).toHaveTextContent('FixedBody1')
    expect(drawn).toHaveTextContent('RigidBody1')
    expect(screen.getByTestId('constraint-track-A')).toBeInTheDocument()
    expect(screen.getByTestId('constraint-track-B')).toBeInTheDocument()
    expect(button(/Show schematic/i)).toBeInTheDocument()
    expect(screen.queryByTestId('jiffy-constraints-errors')).toBeNull()
  })

  it('says which file suits which job', async () => {
    renderPreview(twoBodies)
    expect(
      await screen.findByText(/Either file works for a/)
    ).toHaveTextContent(
      'For a CHARMM job from CRD/PSF files, use the const.inp; its segids must match those in your PSF.'
    )
  })

  it('offers both files, with the same bodies in each', async () => {
    renderPreview(twoBodies)
    expect(button(/Download const.inp/)).toBeEnabled()
    expect(button(/Download openmm_const.yml/)).toBeEnabled()

    const constInp = screen.getByTestId('const-inp-text').textContent ?? ''
    const yaml = screen.getByTestId('openmm-yaml-text').textContent ?? ''
    expect(constInp).toContain('shape desc dock1 rigid')
    expect(yaml).toContain('constraints:')

    // Read back the way the job forms read each kind of file
    const segments = readPdbSegments(pdbText)
    const fromInp = importConstraintsFromConstInp(constInp, 'pdb', {
      structure: segments
    })
    const fromYaml = importConstraintsFromData(parse(yaml), 'pdb', {
      structure: segments
    })
    expect(fromInp.problems).toEqual([])
    expect(fromYaml.problems).toEqual([])
    const ranges = (input: typeof fromInp.input) =>
      [...(input?.fixed_bodies ?? []), ...(input?.rigid_bodies ?? [])].map(
        (b) => b.segments.map((s) => [s.chain_id, s.residues])
      )
    expect(ranges(fromYaml.input)).toEqual(ranges(fromInp.input))
  })

  it('saves a download under its own file name', async () => {
    const user = userEvent.setup()
    const createUrl = vi.fn(() => 'blob:x')
    const revokeUrl = vi.fn()
    Object.assign(window.URL, {
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl
    })
    const names: string[] = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.getAttribute('download') ?? '')
      })
    renderPreview(twoBodies)
    await user.click(button(/Download openmm_const.yml/))
    await user.click(button(/Download const.inp/))
    expect(names).toEqual(['openmm_const.yml', 'const.inp'])
    expect(revokeUrl).toHaveBeenCalledTimes(2)
    click.mockRestore()
  })

  it('hands the PDB and const.inp to a new Classic job', async () => {
    const user = userEvent.setup()
    renderPreview(twoBodies)
    await user.click(button(/Use in a new Classic job/))
    expect(startClassicJob).toHaveBeenCalledTimes(1)
    const handoff = startClassicJob.mock.calls[0]?.[0]
    expect(handoff.structure).toBe(pdbFile)
    expect(handoff.from).toBe('the Inp Jiffy™')
    expect(handoff.constraints.name).toBe('const.inp')
    await waitFor(async () =>
      expect(await handoff.constraints.text()).toContain(
        'shape desc dock1 rigid'
      )
    )
  })

  it('says what BilboMD would refuse, and offers only the const.inp', async () => {
    renderPreview([
      { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 100 }] },
      // Overlaps the fixed body
      { id: 'RIGID 1', domains: [{ chainid: 'A', start: 50, end: 150 }] }
    ])
    expect(
      await screen.findByTestId('jiffy-constraints-errors')
    ).toBeInTheDocument()
    expect(button(/Use in a new Classic job/)).toBeDisabled()
    expect(button(/Download openmm_const.yml/)).toBeDisabled()
    expect(button(/Download const.inp/)).toBeEnabled()
    expect(screen.queryByTestId('openmm-yaml-text')).toBeNull()
  })

  it('says so when there are no bodies', async () => {
    renderPreview([])
    expect(
      await screen.findByText(/No fixed or rigid bodies yet/)
    ).toBeInTheDocument()
    expect(button(/Use in a new Classic job/)).toBeDisabled()
  })
})
