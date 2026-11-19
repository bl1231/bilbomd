import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'yaml'
import {
  importConstraintsFromData,
  readPdbSegments
} from '@bilbomd/bilbomd-types'

vi.mock('../classicHandoff', () => ({ useStartClassicJob: () => vi.fn() }))

import { useJiffyConstraints } from '../useJiffyConstraints'
import { JiffyConstraintsResult } from '../JiffyConstraintsResult'

const here = path.dirname(fileURLToPath(import.meta.url))
// What pae2const.py writes for the AlphaFold example (default settings)
const paeConstInp = readFileSync(
  path.join(here, 'fixtures/example-auto-pae2const.inp'),
  'utf8'
)
const examplePdb = readFileSync(
  path.join(here, '../../../../../../example-data/auto/example-auto.pdb'),
  'utf8'
)
const segments = readPdbSegments(examplePdb)
const structure = new File([examplePdb], 'example-auto.pdb')

describe('a PAE Jiffy result, from real pae2const output', () => {
  it('passes the checks BilboMD will run', () => {
    const { result } = renderHook(() =>
      useJiffyConstraints(paeConstInp, segments)
    )
    expect(result.current.checked?.ok).toBe(true)
    expect(result.current.valid?.fixed_bodies[0]?.segments).toHaveLength(2)
    expect(result.current.valid?.rigid_bodies).toHaveLength(1)
  })

  it('writes an openmm_const.yml with the same bodies', () => {
    const { result } = renderHook(() =>
      useJiffyConstraints(paeConstInp, segments)
    )
    const yaml = result.current.openmmYaml ?? ''
    const read = importConstraintsFromData(parse(yaml), 'pdb', {
      structure: segments
    })
    expect(read.problems).toEqual([])
    const ranges = [
      ...(read.input?.fixed_bodies ?? []),
      ...(read.input?.rigid_bodies ?? [])
    ].map((b) => b.segments.map((s) => [s.chain_id, s.residues]))
    expect(ranges).toEqual([
      [
        ['A', { start: 9, stop: 108 }],
        ['A', { start: 263, stop: 516 }]
      ],
      [['A', { start: 209, stop: 231 }]]
    ])
  })

  it('shows the drawing, both downloads and the hand-off, all on', () => {
    const Result = () => (
      <JiffyConstraintsResult
        result={useJiffyConstraints(paeConstInp, segments)}
        structure={structure}
        from="the PAE Jiffy™"
      />
    )
    render(<Result />)
    expect(screen.getByTestId('jiffy-constraints')).toHaveTextContent(
      'RigidBody1'
    )
    expect(screen.queryByTestId('jiffy-constraints-errors')).toBeNull()
    for (const name of [
      /Use in a new Classic job/,
      /Download const.inp/,
      /Download openmm_const.yml/
    ]) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }
  })

  it('checks nothing and offers only the const.inp before the structure is read', () => {
    const { result } = renderHook(() => useJiffyConstraints(paeConstInp, null))
    expect(result.current.checked).toBeNull()
    expect(result.current.openmmYaml).toBeNull()
    // Drawn from the file alone meanwhile
    expect(result.current.drawn?.rigid_bodies).toHaveLength(1)
  })

  it('lists what BilboMD would refuse, such as more rigid bodies than allowed', () => {
    const lines: string[] = [
      'define fixed1 sele ( resid 1:5 .and. segid PROA ) end',
      'cons fix sele fixed1 end'
    ]
    // 21 rigid bodies, one over the limit
    for (let i = 0; i < 21; i++) {
      const start = 20 + i * 20
      lines.push(
        `define rigid${i + 1} sele ( resid ${start}:${start + 10} .and. segid PROA ) end`,
        `shape desc dock${i + 1} rigid sele rigid${i + 1} end`
      )
    }
    lines.push('return')
    const { result } = renderHook(() =>
      useJiffyConstraints(lines.join('\n'), segments)
    )
    expect(result.current.checked?.ok).toBe(false)
    expect(result.current.openmmYaml).toBeNull()
  })
})
