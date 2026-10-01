import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import { MDConstraintsRenderer } from '../MDConstraintsRenderer'
import { buildChainTracks } from '../constraintTracks'

// Shape of a real Auto job on dev
const autoJobConstraints: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [
        { chain_id: 'A', residues: { start: 9, stop: 108 } },
        { chain_id: 'A', residues: { start: 263, stop: 516 } }
      ]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [{ chain_id: 'A', residues: { start: 209, stop: 231 } }]
    }
  ]
}

describe('buildChainTracks', () => {
  it('groups segments by chain and sizes each track to its highest residue', () => {
    const tracks = buildChainTracks({
      fixed_bodies: [
        {
          name: 'Core',
          segments: [
            { chain_id: 'B', residues: { start: 16, stop: 42 } },
            { chain_id: 'A', residues: { start: 1, stop: 297 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'Arm',
          segments: [{ chain_id: 'B', residues: { start: 67, stop: 196 } }]
        }
      ]
    })

    expect(tracks.map((t) => [t.chainId, t.length])).toEqual([
      ['A', 297],
      ['B', 196]
    ])
    expect(tracks[1]?.segments).toEqual([
      { type: 'fixed', bodyName: 'Core', start: 16, stop: 42 },
      { type: 'rigid', bodyName: 'Arm', start: 67, stop: 196 }
    ])
  })

  it('finds the flexible gaps between constrained segments', () => {
    const [track] = buildChainTracks(autoJobConstraints)
    expect(track?.flexible).toEqual([
      { start: 1, stop: 8 },
      { start: 109, stop: 208 },
      { start: 232, stop: 262 }
    ])
  })

  it('treats overlapping or adjacent segments as one constrained run', () => {
    const [track] = buildChainTracks({
      fixed_bodies: [
        {
          name: 'F',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 50 } },
            { chain_id: 'A', residues: { start: 40, stop: 60 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'R',
          segments: [{ chain_id: 'A', residues: { start: 61, stop: 80 } }]
        }
      ]
    })
    expect(track?.flexible).toEqual([])
  })

  it('tolerates bodies without segments', () => {
    const tracks = buildChainTracks({
      fixed_bodies: [
        { name: 'Empty', segments: [] },
        { name: 'Missing' } as unknown as NonNullable<
          MDConstraintsDTO['fixed_bodies']
        >[number]
      ]
    })
    expect(tracks).toEqual([])
  })
})

describe('MDConstraintsRenderer', () => {
  it('shows an empty state when there are no bodies', () => {
    render(
      <MDConstraintsRenderer
        constraints={{ fixed_bodies: [], rigid_bodies: [] }}
      />
    )
    expect(screen.getByText('No constraints found.')).toBeInTheDocument()
  })

  it('draws one track per chain with the residue scale', () => {
    render(<MDConstraintsRenderer constraints={autoJobConstraints} />)

    expect(screen.getByText('Chain A')).toBeInTheDocument()
    const track = screen.getByTestId('constraint-track-A')
    const segments = within(track).getAllByTestId('constraint-track-segment')
    expect(
      segments.map((s) => s.dataset.type).filter((t) => t !== 'flexible')
    ).toEqual(['fixed', 'fixed', 'rigid'])
    expect(screen.getByText('516')).toBeInTheDocument()
  })

  it('positions segments proportionally along the chain', () => {
    render(
      <MDConstraintsRenderer
        constraints={{
          rigid_bodies: [
            {
              name: 'Half',
              segments: [
                { chain_id: 'A', residues: { start: 1, stop: 50 } },
                { chain_id: 'A', residues: { start: 76, stop: 100 } }
              ]
            }
          ]
        }}
      />
    )
    const blocks = screen.getAllByTestId('constraint-track-segment')
    const [first, second] = blocks.filter((b) => b.dataset.type === 'rigid')
    const [gap] = blocks.filter((b) => b.dataset.type === 'flexible')
    expect(first).toHaveStyle({ left: '0%', width: '50%' })
    expect(second).toHaveStyle({ left: '75%', width: '25%' })
    expect(gap).toHaveStyle({ left: '50%', width: '25%' })
  })

  it('lists each body with its type and residue ranges', () => {
    render(<MDConstraintsRenderer constraints={autoJobConstraints} />)

    expect(screen.getByText('Fixed')).toBeInTheDocument()
    expect(screen.getByText('Rigid')).toBeInTheDocument()
    expect(screen.getByText('FixedBody1')).toBeInTheDocument()
    expect(screen.getByText('RigidBody1')).toBeInTheDocument()
    expect(screen.getByText('A 9–108')).toBeInTheDocument()
    expect(screen.getByText('A 263–516')).toBeInTheDocument()
    expect(screen.getByText('A 209–231')).toBeInTheDocument()
  })

  it('lists and draws the flexible regions', () => {
    render(<MDConstraintsRenderer constraints={autoJobConstraints} />)

    expect(screen.getByText('Flexible')).toBeInTheDocument()
    expect(screen.getByText('A 1–8')).toBeInTheDocument()
    expect(screen.getByText('A 109–208')).toBeInTheDocument()
    expect(screen.getByText('A 232–262')).toBeInTheDocument()
    const flexible = screen
      .getAllByTestId('constraint-track-segment')
      .filter((s) => s.dataset.type === 'flexible')
    expect(flexible).toHaveLength(3)
  })

  it('handles multiple chains and bodies', () => {
    render(
      <MDConstraintsRenderer
        constraints={{
          fixed_bodies: [
            {
              name: 'Core Domain',
              segments: [
                { chain_id: 'A', residues: { start: 1, stop: 100 } },
                { chain_id: 'B', residues: { start: 1, stop: 50 } }
              ]
            }
          ],
          rigid_bodies: [
            {
              name: 'Helix 1',
              segments: [{ chain_id: 'A', residues: { start: 150, stop: 180 } }]
            },
            {
              name: 'Helix 2',
              segments: [{ chain_id: 'B', residues: { start: 60, stop: 70 } }]
            }
          ]
        }}
      />
    )

    expect(screen.getByTestId('constraint-track-A')).toBeInTheDocument()
    expect(screen.getByTestId('constraint-track-B')).toBeInTheDocument()
    expect(screen.getByText('Helix 1')).toBeInTheDocument()
    expect(screen.getByText('Helix 2')).toBeInTheDocument()
    expect(screen.getByText('B 1–50')).toBeInTheDocument()
  })

  it('does not crash on a body with no segments', () => {
    render(
      <MDConstraintsRenderer
        constraints={{ fixed_bodies: [{ name: 'Empty', segments: [] }] }}
      />
    )
    expect(screen.getByText('Empty')).toBeInTheDocument()
    expect(screen.queryByTestId(/constraint-track-/)).not.toBeInTheDocument()
  })
})
