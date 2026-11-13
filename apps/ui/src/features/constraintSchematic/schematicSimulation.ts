import {
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from 'd3-force'
import {
  applyBeadCollisions,
  applyLinkerLimits,
  keepInside,
  pinFixed,
  placeOnCircle,
  springForce,
  targetForce,
  thermalForce,
  type Box,
  type SchematicBody,
  type SchematicModel
} from './schematicModel'

/** Standard normal random numbers (Box–Muller). */
export const standardNormal = (): number => {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Uniform random numbers in [0, 1) from a seed (mulberry32), so a layout can
 * be repeated. */
export const seededRandom = (seed: number) => {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SchematicSimulation {
  simulation: Simulation<SchematicBody, undefined>
  // Lays the model out from scratch and pins the fixed segments
  settle: () => void
  // The position limits that run after every live step
  constrain: () => void
  // The frame bodies are kept inside from then on; set once the layout is
  // settled and the view box is known
  setBounds: (box: Box | null) => void
}

interface Options {
  // Strength of the random motion; read every step
  motion: () => number
  // Standard normal random numbers, for the motion
  normal: () => number
  // Uniform random numbers in [0, 1), for the starting layout
  random: () => number
}

export const createSchematicSimulation = (
  model: SchematicModel,
  { motion, normal, random }: Options
): SchematicSimulation => {
  let settling = false
  const simulation = forceSimulation<SchematicBody>(model.bodies)
    .alphaDecay(0.03)
    .velocityDecay(0.35)
    .force(
      'charge',
      forceManyBody<SchematicBody>()
        .strength((b) => (b.kind === 'tail' ? -8 : -25 - b.R * 1.5))
        .distanceMax(260)
    )
    // Fixed segments gather in the middle; the rest drift back only weakly
    .force(
      'x',
      forceX<SchematicBody>(0).strength((b) =>
        b.kind === 'fixed' ? 0.06 : 0.012
      )
    )
    .force(
      'y',
      forceY<SchematicBody>(0).strength((b) =>
        b.kind === 'fixed' ? 0.06 : 0.012
      )
    )
    .force('springs', springForce(model))
    .force('drag', targetForce(model))
    .force(
      'thermal',
      thermalForce(model, () => (settling ? 0 : motion()), normal)
    )
    .stop()

  let bounds: Box | null = null
  const setBounds = (box: Box | null) => {
    bounds = box
  }

  const constrain = () => {
    if (bounds) keepInside(model, bounds)
    applyBeadCollisions(model)
    applyLinkerLimits(model)
  }

  const steps = (n: number) => {
    for (let i = 0; i < n; i++) {
      simulation.tick()
      constrain()
    }
  }

  const settle = () => {
    settling = true
    placeOnCircle(model, random)
    simulation.nodes(model.bodies).alpha(1)
    // First let the fixed segments find their places along their linkers,
    // then pin them and let everything else settle around them
    steps(260)
    pinFixed(model)
    simulation.alpha(0.6)
    steps(180)
    settling = false
  }

  return { simulation, settle, constrain, setBounds }
}
