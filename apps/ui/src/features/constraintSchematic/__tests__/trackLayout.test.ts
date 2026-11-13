import { describe, it, expect } from 'vitest'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import { buildSchematicModel } from '../schematicModel'
import { BAR_HEIGHT, TRACK_WIDTH, layoutTracks } from '../trackLayout'

const constraints: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [{ chain_id: 'A', residues: { start: 1, stop: 100 } }]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [
        { chain_id: 'A', residues: { start: 120, stop: 200 } },
        { chain_id: 'A', residues: { start: 230, stop: 300 } },
        { chain_id: 'B', residues: { start: 20, stop: 95 } }
      ]
    },
    {
      name: 'RigidBody2',
      segments: [{ chain_id: 'B', residues: { start: 110, stop: 150 } }]
    }
  ]
}

const layout = () => layoutTracks(buildSchematicModel(constraints))

describe('layoutTracks', () => {
  it('gives each chain a row that stops at its last constrained residue', () => {
    const { rows, height, width } = layout()
    expect(rows.map((r) => [r.chainId, r.length])).toEqual([
      ['A', 300],
      ['B', 150]
    ])
    expect(rows[1]!.y).toBeGreaterThan(rows[0]!.y)
    expect(height).toBeGreaterThan(rows[1]!.y)
    expect(width).toBe(TRACK_WIDTH)
  })

  it('puts every chain on one residue scale', () => {
    const [a, b] = layout().rows
    expect(a!.x0).toBe(b!.x0)
    // Chain B is half as long as chain A
    expect((b!.x1 - b!.x0) / (a!.x1 - a!.x0)).toBeCloseTo(0.5)
    expect(a!.x1).toBeLessThanOrEqual(TRACK_WIDTH)
  })

  it('draws a bar per segment, sized to its residues, and keeps tiny ones visible', () => {
    const tiny = layoutTracks(
      buildSchematicModel({
        rigid_bodies: [
          {
            name: 'R',
            segments: [
              { chain_id: 'A', residues: { start: 1, stop: 5000 } },
              { chain_id: 'A', residues: { start: 5001, stop: 5001 } }
            ]
          }
        ]
      })
    )
    expect(tiny.segments[1]!.width).toBe(2.5)

    const { segments, rows } = layout()
    expect(segments).toHaveLength(5)
    const first = segments.find((s) => s.bead.start === 1)!
    const second = segments.find((s) => s.bead.start === 120)!
    expect(first.x).toBe(rows[0]!.x0)
    // 100 residues vs 81 residues
    expect(first.width / second.width).toBeCloseTo(100 / 81)
    expect(first.y).toBe(rows[0]!.y - BAR_HEIGHT / 2)
  })

  it('adds a hover area over each flexible stretch', () => {
    const { gaps } = layout()
    expect(
      gaps.map((g) => [g.linker.chainId, g.linker.start, g.linker.stop])
    ).toEqual([
      ['A', 101, 119],
      ['A', 201, 229],
      ['B', 1, 19],
      ['B', 96, 109]
    ])
  })

  it('joins the segments of a multi-segment rigid body with arcs', () => {
    const { arcs, rows } = layout()
    // A120–200 → A230–300 on chain A, then A230–300 → B20–95 across chains
    expect(arcs).toHaveLength(2)
    expect(arcs.every((a) => a.body.name === 'RigidBody1')).toBe(true)
    const [same, cross] = arcs
    const ys = (d: string) =>
      [...d.matchAll(/-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]))
    // The same-chain arc rises above chain A's bar
    expect(Math.min(...ys(same!.d))).toBeLessThan(rows[0]!.y - BAR_HEIGHT / 2)
    // The cross-chain arc runs from chain A down to chain B
    const crossYs = ys(cross!.d)
    expect(crossYs[0]).toBeGreaterThan(rows[0]!.y)
    expect(crossYs[crossYs.length - 1]).toBeLessThan(rows[1]!.y)
  })

  it('handles a model with no bodies', () => {
    const empty = layoutTracks(buildSchematicModel({}))
    expect(empty.rows).toEqual([])
    expect(empty.segments).toEqual([])
    expect(empty.arcs).toEqual([])
  })
})
