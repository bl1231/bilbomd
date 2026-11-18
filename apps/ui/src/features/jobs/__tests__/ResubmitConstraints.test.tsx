import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Form, Formik } from 'formik'
import { render, screen } from '@testing-library/react'
import type { ConstraintsInput, MDConstraintsDTO } from '@bilbomd/bilbomd-types'

// The original job's files, by name
const { files } = vi.hoisted(() => ({
  files: {} as Record<string, string>
}))
vi.mock('slices/jobsApiSlice', () => ({
  useGetFileByIdAndNameQuery: (
    args: { id: string; filename: string },
    options: { skip?: boolean }
  ) =>
    options.skip
      ? { data: undefined, isLoading: false, isError: false }
      : {
          data: files[args.filename],
          isLoading: false,
          isError: files[args.filename] === undefined
        }
}))

import { ResubmitConstraints } from '../ResubmitConstraints'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const psfAtom = (n: number, segid: string, resid: number) =>
  `${String(n).padStart(8)} ${segid.padEnd(4)} ${String(resid).padEnd(4)} ALA  CA   CT1   0.070000   12.0110   0`

const renderResubmit = (
  props: Partial<Parameters<typeof ResubmitConstraints>[0]>
) =>
  render(
    <Formik
      initialValues={{ constraints: null as ConstraintsInput | null }}
      onSubmit={() => {}}
    >
      <Form>
        <ResubmitConstraints
          jobId="job-1"
          mode="pdb"
          structure="model.pdb"
          engine="charmm"
          {...props}
        />
      </Form>
    </Formik>
  )

beforeEach(() => {
  for (const key of Object.keys(files)) delete files[key]
  files['model.pdb'] = Array.from({ length: 50 }, (_, i) =>
    atom('A', 'ALA', i + 1)
  ).join('\n')
  files['model.psf'] = [
    '       3 !NATOM',
    psfAtom(1, 'PROA', 1),
    psfAtom(2, 'PROA', 2),
    psfAtom(3, 'HETA', 1)
  ].join('\n')
})

describe('ResubmitConstraints', () => {
  it("starts from the original job's stored constraints", async () => {
    const stored: MDConstraintsDTO = {
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [{ chain_id: 'A', residues: { start: 5, stop: 20 } }]
        }
      ]
    }
    renderResubmit({ mdConstraints: stored, constFileName: 'const.inp' })
    expect(await screen.findByTestId('const-inp-preview')).toHaveTextContent(
      'resid 5:20 .and. segid PROA'
    )
  })

  it('reads an older CRD/PSF job’s const.inp when its stored constraints lack segids', async () => {
    files['const.inp'] = [
      'define fixed1 sele ( segid PROA ) end',
      'cons fix sele fixed1 end',
      'define rigid1 sele ( segid HETA ) end',
      'shape desc dock1 rigid sele rigid1 end',
      'return'
    ].join('\n')
    renderResubmit({
      mode: 'crd_psf',
      structure: 'model.psf',
      constFileName: 'const.inp',
      mdConstraints: {
        fixed_bodies: [
          {
            name: 'FixedBody1',
            segments: [{ chain_id: 'A', residues: { start: 1, stop: 2 } }]
          }
        ]
      }
    })
    const preview = await screen.findByTestId('const-inp-preview')
    expect(preview).toHaveTextContent('define fixed1 sele ( segid PROA ) end')
    expect(preview).toHaveTextContent('shape desc dock1 rigid sele rigid1 end')
  })

  it('uses a newly picked structure file instead of the original', async () => {
    const picked = new File(
      [
        Array.from({ length: 10 }, (_, i) => atom('B', 'ALA', i + 1)).join('\n')
      ],
      'new.pdb'
    )
    renderResubmit({ structure: picked })
    expect(await screen.findByTestId('const-inp-preview')).toHaveTextContent(
      'segid PROB'
    )
  })

  it('asks for the structure again when the original is gone', async () => {
    delete files['model.pdb']
    renderResubmit({})
    expect(
      await screen.findByText(/original structure file could not be read/)
    ).toBeInTheDocument()
  })
})
