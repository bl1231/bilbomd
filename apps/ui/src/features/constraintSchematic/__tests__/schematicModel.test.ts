import { describe, it, expect } from 'vitest'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import {
  applyBeadCollisions,
  applyLinkerLimits,
  beadPosition,
  beadRadius,
  bodyColor,
  buildSchematicModel,
  describeBody,
  describeFixedBodies,
  describeLinker,
  fitViewBox,
  isTaut,
  keepInside,
  linkerPath,
  makeLinker,
  pinFixed,
  placeOnCircle,
  squigglePath,
  thermalForce,
  visibleLabels,
  type SchematicModel
} from '../schematicModel'
import { createSchematicSimulation, seededRandom } from '../schematicSimulation'

// Two chains: B rides along with dock1 through a cross-chain rigid body
const twoChains: MDConstraintsDTO = {
  fixed_bodies: [
    {
      name: 'FixedBody1',
      segments: [{ chain_id: 'A', residues: { start: 1, stop: 150 } }]
    }
  ],
  rigid_bodies: [
    {
      name: 'RigidBody1',
      segments: [
        { chain_id: 'A', residues: { start: 171, stop: 290 } },
        { chain_id: 'B', residues: { start: 20, stop: 95 } }
      ]
    },
    {
      name: 'RigidBody2',
      segments: [{ chain_id: 'A', residues: { start: 311, stop: 400 } }]
    }
  ]
}

const bodyByName = (model: SchematicModel, name: string) => {
  const body = model.bodies.find((b) => b.name === name)
  if (!body) throw new Error(`no body ${name}`)
  return body
}

describe('buildSchematicModel', () => {
  it('makes a body per fixed segment, per rigid body and per N-terminal tail', () => {
    const model = buildSchematicModel(twoChains)
    expect(model.bodies.map((b) => [b.kind, b.key])).toEqual([
      ['fixed', 'fixed'],
      ['rigid', 'rigid-0'],
      ['rigid', 'rigid-1'],
      ['tail', 'tail-B']
    ])
    expect(model.fixedCount).toBe(1)
    expect(model.rigidCount).toBe(2)
    expect(model.chainIds).toEqual(['A', 'B'])
    expect(bodyByName(model, 'RigidBody1').beads).toHaveLength(2)
    expect(bodyByName(model, 'RigidBody1').residues).toBe(120 + 76)
  })

  it('splits a fixed body with several segments into pinnable beads', () => {
    const model = buildSchematicModel({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 10 } },
            { chain_id: 'A', residues: { start: 20, stop: 30 } }
          ]
        }
      ]
    })
    expect(model.bodies.filter((b) => b.kind === 'fixed')).toHaveLength(2)
    expect(model.fixedCount).toBe(2)
  })

  it('links consecutive segments along each chain, with the residues between', () => {
    const model = buildSchematicModel(twoChains)
    expect(model.linkers.map((l) => [l.chainId, l.start, l.stop, l.n])).toEqual(
      [
        ['A', 151, 170, 20],
        ['A', 291, 310, 20],
        ['B', 1, 19, 19]
      ]
    )
  })

  it('adds no linker between touching or overlapping segments', () => {
    const model = buildSchematicModel({
      rigid_bodies: [
        {
          name: 'R1',
          segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
        },
        {
          name: 'R2',
          segments: [{ chain_id: 'A', residues: { start: 51, stop: 60 } }]
        },
        {
          name: 'R3',
          segments: [{ chain_id: 'A', residues: { start: 55, stop: 70 } }]
        }
      ]
    })
    expect(model.linkers.map((l) => l.n)).toEqual([0])
  })

  it('packs the beads of one body without overlap', () => {
    const body = bodyByName(buildSchematicModel(twoChains), 'RigidBody1')
    const [p, q] = body.beads
    if (!p || !q) throw new Error('expected two beads')
    const d = Math.hypot(p.ox - q.ox, p.oy - q.oy)
    expect(d).toBeGreaterThanOrEqual(p.r + q.r)
    expect(body.R).toBeGreaterThan(Math.max(p.r, q.r))
  })

  it('skips bodies with no segments and returns empty for no constraints', () => {
    const model = buildSchematicModel({
      rigid_bodies: [{ name: 'Empty', segments: [] }]
    })
    expect(model.bodies).toEqual([])
    expect(model.rigidCount).toBe(0)
    expect(fitViewBox(model)).toEqual({
      x: -280,
      y: -160,
      width: 560,
      height: 320
    })
  })
})

describe('linkers', () => {
  it('rests near a √n coil and stretches to about full length', () => {
    const model = buildSchematicModel(twoChains)
    const [a, b] = model.beads
    if (!a || !b) throw new Error('expected beads')
    const short = makeLinker(a, b, 'A', 1, 1)
    const long = makeLinker(a, b, 'A', 1, 100)
    expect(long.rest).toBeCloseTo(83)
    expect(long.max).toBeCloseTo(340)
    expect(short.max).toBeGreaterThan(short.rest)
    expect(makeLinker(a, b, 'A', 5, 4)).toMatchObject({
      n: 0,
      rest: 1.5,
      max: 3
    })
  })

  it('pulls bodies back to full stretch, moving only the free end', () => {
    const model = buildSchematicModel(twoChains)
    const fixed = bodyByName(model, 'Fixed')
    const dock2 = bodyByName(model, 'RigidBody2')
    pinFixed(model)
    dock2.x = 5000
    dock2.y = 0
    applyLinkerLimits(model)
    expect(fixed.x).toBe(0)
    for (const linker of model.linkers) {
      const a = beadPosition(linker.a)
      const b = beadPosition(linker.b)
      const gap = Math.hypot(b.x - a.x, b.y - a.y) - linker.a.r - linker.b.r
      expect(gap).toBeLessThanOrEqual(linker.max + 0.5)
    }
    expect(model.linkers.some(isTaut)).toBe(true)
  })

  it('keeps a chain of free bodies within every linker when one is pulled far', () => {
    // Five rigid bodies in a row, linked by short linkers
    const model = buildSchematicModel({
      rigid_bodies: Array.from({ length: 5 }, (_, i) => ({
        name: `R${i}`,
        segments: [
          { chain_id: 'A', residues: { start: i * 20 + 1, stop: i * 20 + 15 } }
        ]
      }))
    })
    model.bodies.forEach((b, i) => {
      b.x = i * 30
      b.y = 0
    })
    const last = model.bodies[model.bodies.length - 1]!
    last.x = 10000
    last.y = 4000
    applyLinkerLimits(model)
    for (const linker of model.linkers) {
      const a = beadPosition(linker.a)
      const b = beadPosition(linker.b)
      const gap = Math.hypot(b.x - a.x, b.y - a.y) - linker.a.r - linker.b.r
      expect(gap).toBeLessThanOrEqual(linker.max + 0.5)
    }
  })

  it('leaves linkers between two pinned ends alone', () => {
    const model = buildSchematicModel({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 10 } },
            { chain_id: 'A', residues: { start: 13, stop: 20 } }
          ]
        }
      ]
    })
    pinFixed(model)
    const [, second] = model.bodies
    second!.x = 500
    applyLinkerLimits(model)
    expect(second!.x).toBe(500)
  })

  it('describes the flexible range', () => {
    const model = buildSchematicModel(twoChains)
    expect(describeLinker(model.linkers[0]!)).toBe(
      'Flexible · A 151–170 · 20 residues'
    )
  })
})

describe('applyBeadCollisions', () => {
  it('separates beads of different bodies, leaving pinned ones in place', () => {
    const model = buildSchematicModel(twoChains)
    pinFixed(model)
    const fixed = bodyByName(model, 'Fixed')
    const dock2 = bodyByName(model, 'RigidBody2')
    dock2.x = 0
    dock2.y = 0
    for (let i = 0; i < 5; i++) applyBeadCollisions(model)
    const fb = fixed.beads[0]!
    const db = dock2.beads[0]!
    const a = beadPosition(fb)
    const b = beadPosition(db)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(fb.r + db.r)
    expect([fixed.x, fixed.y]).toEqual([0, 0])
  })
})

describe('thermalForce', () => {
  it('kicks free bodies only, and nothing at zero motion', () => {
    const model = buildSchematicModel(twoChains)
    pinFixed(model)
    for (const b of model.bodies) {
      b.vx = 0
      b.vy = 0
    }
    thermalForce(
      model,
      () => 0,
      () => 1
    )()
    expect(model.bodies.every((b) => b.vx === 0)).toBe(true)
    thermalForce(
      model,
      () => 1,
      () => 1
    )()
    expect(bodyByName(model, 'Fixed').vx).toBe(0)
    const dock1 = bodyByName(model, 'RigidBody1')
    const tail = model.bodies.find((b) => b.kind === 'tail')!
    expect(dock1.vx).toBeGreaterThan(0)
    // The light tail moves more than the heavy rigid body
    expect(tail.vx).toBeGreaterThan(dock1.vx ?? 0)
  })
})

describe('layout', () => {
  it('places every body on a circle and unpins them', () => {
    const model = buildSchematicModel(twoChains)
    pinFixed(model)
    placeOnCircle(model, () => 0)
    const radii = model.bodies.map((b) => Math.hypot(b.x, b.y))
    expect(new Set(radii.map((r) => r.toFixed(3))).size).toBe(1)
    expect(model.bodies.every((b) => !b.pinned && b.fx === null)).toBe(true)
  })

  it('settles with fixed segments pinned and every linker within its length', () => {
    const model = buildSchematicModel(twoChains)
    const { settle, simulation } = createSchematicSimulation(model, {
      motion: () => 1,
      normal: () => 1,
      random: seededRandom(7)
    })
    settle()
    simulation.stop()
    const fixed = bodyByName(model, 'Fixed')
    expect(fixed.pinned).toBe(true)
    expect(fixed.fx).toBe(fixed.x)
    for (const linker of model.linkers) {
      const a = beadPosition(linker.a)
      const b = beadPosition(linker.b)
      const gap = Math.hypot(b.x - a.x, b.y - a.y) - linker.a.r - linker.b.r
      expect(gap).toBeLessThanOrEqual(linker.max + 1)
    }
    const box = fitViewBox(model)
    for (const body of model.bodies) {
      expect(body.x).toBeGreaterThan(box.x)
      expect(body.x).toBeLessThan(box.x + box.width)
      expect(body.y).toBeGreaterThan(box.y)
      expect(body.y).toBeLessThan(box.y + box.height)
    }
    expect(box.width / box.height).toBeGreaterThanOrEqual(1.4 - 1e-9)
  })

  it('repeats the same layout for the same seed', () => {
    const layout = (seed: number) => {
      const model = buildSchematicModel(twoChains)
      createSchematicSimulation(model, {
        motion: () => 0,
        normal: () => 0,
        random: seededRandom(seed)
      }).settle()
      return model.bodies.map((b) => [b.x, b.y])
    }
    expect(layout(3)).toEqual(layout(3))
    expect(layout(3)).not.toEqual(layout(4))
  })
})

describe('keepInside', () => {
  const box = { x: -100, y: -100, width: 200, height: 200 }

  it('pulls free bodies back inside the frame, leaving pinned ones', () => {
    const model = buildSchematicModel(twoChains)
    pinFixed(model)
    const fixed = bodyByName(model, 'Fixed')
    fixed.x = 500
    const dock2 = bodyByName(model, 'RigidBody2')
    dock2.x = 900
    dock2.y = -900
    keepInside(model, box)
    expect(fixed.x).toBe(500)
    expect(dock2.x + dock2.R).toBeLessThanOrEqual(box.x + box.width)
    expect(dock2.y - dock2.R).toBeGreaterThanOrEqual(box.y)
  })

  it('keeps a dragged body in view in the running simulation', () => {
    const model = buildSchematicModel(twoChains)
    const sim = createSchematicSimulation(model, {
      motion: () => 0,
      normal: () => 0,
      random: seededRandom(2)
    })
    sim.settle()
    const view = fitViewBox(model)
    sim.setBounds(view)
    const tail = model.bodies.find((b) => b.kind === 'tail')!
    tail.target = { x: view.x + view.width * 10, y: view.y - view.height * 10 }
    for (let i = 0; i < 200; i++) {
      sim.simulation.tick()
      sim.constrain()
    }
    sim.simulation.stop()
    for (const body of model.bodies) {
      expect(body.x).toBeGreaterThanOrEqual(view.x)
      expect(body.x).toBeLessThanOrEqual(view.x + view.width)
      expect(body.y).toBeGreaterThanOrEqual(view.y)
      expect(body.y).toBeLessThanOrEqual(view.y + view.height)
    }
  })
})

describe('squigglePath', () => {
  it('is a straight line for one residue or none', () => {
    expect(squigglePath(0, 0, 10, 0, 1, 20)).toBe('M0.0,0.0L10.0,0.0')
  })

  it('waves when slack and flattens at full stretch', () => {
    const ys = (path: string) =>
      [...path.matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map((m) =>
        Math.abs(Number(m[1]))
      )
    const slack = Math.max(...ys(squigglePath(0, 0, 40, 0, 20, 100)))
    const taut = Math.max(...ys(squigglePath(0, 0, 100, 0, 20, 100)))
    expect(slack).toBeGreaterThan(1)
    expect(taut).toBeLessThan(0.1)
  })

  it('runs between the bead surfaces', () => {
    const model = buildSchematicModel(twoChains)
    const linker = model.linkers[0]!
    linker.a.body.x = 0
    linker.a.body.y = 0
    linker.b.body.x = 300
    linker.b.body.y = 0
    linker.a.ox = linker.a.oy = linker.b.ox = linker.b.oy = 0
    expect(linkerPath(linker).startsWith(`M${linker.a.r.toFixed(1)},0.0`)).toBe(
      true
    )
  })
})

describe('packBeads', () => {
  it('keeps the linkers inside a rigid body within their length', () => {
    // A big segment with short single-residue segments around it, all one
    // body, joined by one-residue linkers that can only reach ~14 units
    const segments = [
      { chain_id: 'A', residues: { start: 1, stop: 400 } },
      ...Array.from({ length: 8 }, (_, i) => ({
        chain_id: 'A',
        residues: { start: 402 + 2 * i, stop: 402 + 2 * i }
      }))
    ]
    const model = buildSchematicModel({
      rigid_bodies: [{ name: 'R1', segments }]
    })
    const [body] = model.bodies
    expect(model.linkers).toHaveLength(8)
    for (const linker of model.linkers) {
      expect(linker.a.body).toBe(body)
      const gap =
        Math.hypot(linker.b.ox - linker.a.ox, linker.b.oy - linker.a.oy) -
        linker.a.r -
        linker.b.r
      expect(gap).toBeLessThanOrEqual(linker.max)
    }
    // Every bead fits inside the body's circle
    for (const bead of body!.beads) {
      expect(Math.hypot(bead.ox, bead.oy) + bead.r).toBeLessThanOrEqual(
        body!.R + 1e-6
      )
    }
  })
})

describe('describeBody', () => {
  it('names segments and what the body does', () => {
    const model = buildSchematicModel(twoChains)
    expect(describeBody(model, bodyByName(model, 'RigidBody1'))).toBe(
      'RigidBody1 · moves as one unit · A 171–290, B 20–95 · 196 residues'
    )
    expect(describeBody(model, bodyByName(model, 'Fixed'))).toBe(
      'Fixed · A 1–150 · 150 residues · held in place'
    )
    const tail = model.bodies.find((b) => b.kind === 'tail')!
    expect(describeBody(model, tail)).toBe(
      'Chain B N-terminus · free end of 19 flexible residues'
    )
  })

  it('sums up every fixed segment for the legend', () => {
    const model = buildSchematicModel({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 10 } },
            { chain_id: 'B', residues: { start: 5, stop: 5 } }
          ]
        }
      ]
    })
    expect(describeFixedBodies(model)).toBe(
      'Fixed · A 1–10, B 5 · 11 residues · held in place'
    )
  })

  it('mentions the other fixed segments', () => {
    const model = buildSchematicModel({
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 10 } },
            { chain_id: 'A', residues: { start: 20, stop: 30 } },
            { chain_id: 'A', residues: { start: 40, stop: 40 } }
          ]
        }
      ]
    })
    expect(describeBody(model, model.bodies[2]!)).toBe(
      'Fixed · A 40 · 1 residue · held in place, like the other 2 fixed segments'
    )
  })
})

describe('visibleLabels', () => {
  it('hides a smaller body label that would overlap a bigger one', () => {
    const model = buildSchematicModel(twoChains)
    const [big, small] = [
      bodyByName(model, 'RigidBody1'),
      bodyByName(model, 'RigidBody2')
    ]
    big.x = small.x = 0
    big.y = small.y = 0
    const shown = visibleLabels([small, big], () => 0)
    expect([...shown]).toEqual([big])
    small.x = 500
    expect(visibleLabels([small, big], () => 0).size).toBe(2)
  })
})

describe('bodyColor', () => {
  it('gives each rigid body its own color and wraps past the palette', () => {
    const model = buildSchematicModel({
      rigid_bodies: Array.from({ length: 10 }, (_, i) => ({
        name: `R${i}`,
        segments: [
          { chain_id: 'A', residues: { start: i * 10 + 1, stop: i * 10 + 5 } }
        ]
      }))
    })
    const colors = model.bodies
      .filter((b) => b.kind === 'rigid')
      .map((b) => bodyColor(b, false))
    expect(new Set(colors.slice(0, 9)).size).toBe(9)
    expect(colors[9]).toBe(colors[0])
    expect(bodyColor(model.bodies[0]!, true)).not.toBe(colors[0])
    expect(beadRadius(100)).toBeCloseTo(20.5)
  })
})
