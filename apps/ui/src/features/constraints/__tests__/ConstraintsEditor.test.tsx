import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  readPdbSegments,
  type ConstraintsInput,
  type StructureSegment
} from '@bilbomd/bilbomd-types'
import { ConstraintsEditor } from '../ConstraintsEditor'
import { defaultConstraints } from '../constraintsModel'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

// Protein chain a (segment PROA) and DNA chain A (segment DNAA)
const segments: StructureSegment[] = readPdbSegments(
  [
    ...Array.from({ length: 100 }, (_, i) => atom('a', 'ALA', i + 1)),
    ...Array.from({ length: 20 }, (_, i) => atom('A', 'DA', i + 1))
  ].join('\n')
)

const Harness = ({
  initial,
  onChange = () => {},
  engine = 'charmm'
}: {
  initial: ConstraintsInput
  onChange?: (value: ConstraintsInput) => void
  engine?: 'charmm' | 'openmm'
}) => {
  const [value, setValue] = useState(initial)
  return (
    <ConstraintsEditor
      mode="pdb"
      segments={segments}
      value={value}
      engine={engine}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const importFile = (text: string, name = 'const.inp') => {
  const input = screen.getByTestId('constraints-import')
  fireEvent.change(input, {
    target: { files: [new File([text], name)] }
  })
}

describe('ConstraintsEditor', () => {
  it('shows the const.inp BilboMD will write for CHARMM jobs', () => {
    render(<Harness initial={defaultConstraints('pdb', segments)} />)
    const preview = screen.getByTestId('const-inp-preview')
    expect(preview).toHaveTextContent('define fixed1 sele ( segid PROA ) end')
    expect(preview).toHaveTextContent('define fixed2 sele ( segid DNAA ) end')
  })

  it('shows no const.inp for OpenMM jobs', () => {
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        engine="openmm"
      />
    )
    expect(screen.queryByTestId('const-inp-preview')).toBeNull()
  })

  it('shows the server-side errors, such as overlapping bodies', () => {
    render(
      <Harness
        initial={{
          fixed_bodies: [
            { segments: [{ chain_id: 'a', residues: { start: 1, stop: 50 } }] }
          ],
          rigid_bodies: [
            { segments: [{ chain_id: 'a', residues: { start: 40, stop: 80 } }] }
          ]
        }}
      />
    )
    expect(screen.getByTestId('constraints-errors')).toHaveTextContent(
      'FixedBody1 and RigidBody1 both include segment PROA residues 40-50'
    )
    expect(screen.queryByTestId('const-inp-preview')).toBeNull()
  })

  it('adds a rigid body', () => {
    const onChange = vi.fn()
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add rigid body' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rigid_bodies: [expect.anything()] })
    )
    expect(screen.getByText('Rigid body 1')).toBeInTheDocument()
  })

  it('imports a const.inp, matching segids to the structure', async () => {
    const onChange = vi.fn()
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        onChange={onChange}
      />
    )
    importFile(
      [
        'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'define rigid1 sele ( segid DNAA ) end',
        'shape desc dock1 rigid sele rigid1 end',
        'return'
      ].join('\n')
    )
    // PROA is chain a here, not A; the segid is kept, since one chain can
    // be several segments
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        fixed_bodies: [
          {
            segments: [
              { chain_id: 'a', segid: 'PROA', residues: { start: 1, stop: 40 } }
            ]
          }
        ],
        rigid_bodies: [{ segments: [{ chain_id: 'A', segid: 'DNAA' }] }]
      })
    )
  })

  it('asks which cons fix is the fixed body', async () => {
    const onChange = vi.fn()
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        onChange={onChange}
      />
    )
    importFile(
      [
        'define a sele ( resid 1:10 .and. segid PROA ) end',
        'define b sele ( resid 20:30 .and. segid PROA ) end',
        'cons fix sele a end',
        'cons fix sele b end',
        'return'
      ].join('\n')
    )
    const choice = await screen.findByTestId('fixed-body-choice')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: /cons fix #2: PROA 20–30/ })
    )
    expect(onChange).toHaveBeenLastCalledWith({
      fixed_bodies: [
        {
          segments: [
            { chain_id: 'a', segid: 'PROA', residues: { start: 20, stop: 30 } }
          ]
        }
      ]
    })
    expect(choice).not.toBeInTheDocument()
  })

  it('leaves out and reports anything else in the file, such as system', async () => {
    render(<Harness initial={defaultConstraints('pdb', segments)} />)
    importFile(
      [
        'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
        'cons fix sele fixed1 end',
        'system "id"',
        'return'
      ].join('\n')
    )
    expect(
      await screen.findByTestId('const-inp-import-notes')
    ).toHaveTextContent('Left out: system "id"')
  })

  it("imports an OpenMM results download's openmm_config.yaml", async () => {
    const onChange = vi.fn()
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        onChange={onChange}
      />
    )
    importFile(
      [
        'input:',
        '  pdb_file: model.pdb',
        'constraints:',
        '  fixed_bodies:',
        '    - name: FixedBody1',
        '      segments:',
        '        - chain_id: a',
        '          residues:',
        '            start: 1',
        '            stop: 40',
        '  rigid_bodies:',
        '    - name: RigidBody1',
        '      segments:',
        '        - chain_id: A',
        '          residues:',
        '            start: 1',
        '            stop: 20'
      ].join('\n'),
      'openmm_config.yaml'
    )
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        fixed_bodies: [
          { segments: [{ chain_id: 'a', residues: { start: 1, stop: 40 } }] }
        ],
        rigid_bodies: [
          { segments: [{ chain_id: 'A', residues: { start: 1, stop: 20 } }] }
        ]
      })
    )
    expect(screen.queryByTestId('const-inp-import-notes')).toBeNull()
  })

  it('imports constraints JSON and reports fields it leaves out', async () => {
    const onChange = vi.fn()
    render(
      <Harness
        initial={defaultConstraints('pdb', segments)}
        onChange={onChange}
      />
    )
    importFile(
      JSON.stringify({
        fixed_bodies: [{ segments: [{ chain_id: 'a', extra: 1 }] }]
      }),
      'constraints.json'
    )
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        fixed_bodies: [{ segments: [{ chain_id: 'a' }] }]
      })
    )
    expect(screen.getByTestId('const-inp-import-notes')).toHaveTextContent(
      'left out field "extra"'
    )
  })

  it('says so when a YAML file cannot be read', async () => {
    render(<Harness initial={defaultConstraints('pdb', segments)} />)
    importFile('constraints: [unclosed', 'broken.yml')
    expect(
      await screen.findByTestId('const-inp-import-notes')
    ).toHaveTextContent('could not be read as YAML or JSON')
  })
})
