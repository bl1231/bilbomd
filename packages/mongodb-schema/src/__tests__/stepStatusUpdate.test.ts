import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { buildStepStatusUpdate } from '../stepStatusUpdate.js'
import { Job } from '../models/Job.js'

describe('buildStepStatusUpdate (shape)', () => {
  it('wraps status and message in $literal', () => {
    const [stage] = buildStepStatusUpdate('md', {
      status: 'Running',
      message: '$HOME not set'
    }) as [{ $set: Record<string, unknown> }]

    expect(stage.$set['steps.md.status']).toEqual({ $literal: 'Running' })
    expect(stage.$set['steps.md.message']).toEqual({
      $literal: '$HOME not set'
    })
  })

  it('leaves message untouched when omitted', () => {
    const [stage] = buildStepStatusUpdate('foxs', {
      status: 'Error'
    }) as [{ $set: Record<string, unknown> }]

    expect(stage.$set).not.toHaveProperty('steps.foxs.message')
  })

  it('only sets started_at when empty on Running', () => {
    const [stage] = buildStepStatusUpdate('heat', {
      status: 'Running'
    }) as [{ $set: Record<string, unknown> }]

    expect(stage.$set['steps.heat.started_at']).toEqual({
      $ifNull: ['$steps.heat.started_at', '$$NOW']
    })
  })
})

// These exercise the real pipeline semantics ($$NOW, $$REMOVE, $ifNull on
// dotted paths). They need a MongoDB: set MONGO_TEST_URI to run them, e.g.
//   docker run --rm -d --name schema-it-mongo -p 29018:27017 mongo:8.3.8
//   MONGO_TEST_URI=mongodb://localhost:29018/schema-it pnpm -F @bilbomd/mongodb-schema test
const uri = process.env.MONGO_TEST_URI

describe.skipIf(!uri)('buildStepStatusUpdate (against MongoDB)', () => {
  let id: mongoose.Types.ObjectId

  const apply = (...args: Parameters<typeof buildStepStatusUpdate>) =>
    Job.updateOne({ _id: id }, buildStepStatusUpdate(...args), {
      updatePipeline: true
    })

  const steps = async () => {
    const doc = await Job.collection.findOne({ _id: id })
    return doc?.steps
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  beforeAll(async () => {
    await mongoose.connect(uri as string)
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    // Insert raw so the test doesn't depend on every required Job field.
    id = new mongoose.Types.ObjectId()
    await Job.collection.insertOne({ _id: id, title: 'timing test' })
  })

  it('creates the steps object when the job has none', async () => {
    await apply('minimize', { status: 'Running', message: 'go' })
    const s = await steps()

    expect(s.minimize.status).toBe('Running')
    expect(s.minimize.message).toBe('go')
    expect(s.minimize.started_at).toBeInstanceOf(Date)
  })

  it('records completed_at and duration_ms on Success', async () => {
    await apply('heat', { status: 'Running', message: '' })
    await sleep(25)
    await apply('heat', { status: 'Success', message: 'done' })
    const { heat } = await steps()

    expect(heat.completed_at).toBeInstanceOf(Date)
    expect(heat.duration_ms).toBeGreaterThanOrEqual(20)
    expect(heat.duration_ms).toBe(
      heat.completed_at.getTime() - heat.started_at.getTime()
    )
  })

  it('keeps the first start and last finish across parallel runs', async () => {
    await apply('md', { status: 'Running', message: 'rg 20' })
    const { md: first } = await steps()
    await sleep(10)
    await apply('md', { status: 'Running', message: 'rg 30' })
    await apply('md', { status: 'Success', message: 'rg 20 done' })
    await sleep(10)
    await apply('md', { status: 'Success', message: 'rg 30 done' })
    const { md } = await steps()

    expect(md.started_at).toEqual(first.started_at)
    expect(md.message).toBe('rg 30 done')
    expect(md.duration_ms).toBe(
      md.completed_at.getTime() - md.started_at.getTime()
    )
  })

  it('clears completed_at when a step goes back to Running', async () => {
    await apply('foxs', { status: 'Running', message: '' })
    await apply('foxs', { status: 'Success', message: '' })
    await apply('foxs', { status: 'Running', message: 'again' })
    const { foxs } = await steps()

    expect(foxs.started_at).toBeInstanceOf(Date)
    expect(foxs).not.toHaveProperty('completed_at')
    expect(foxs).not.toHaveProperty('duration_ms')
  })

  it('omits duration_ms when a step finishes without having started', async () => {
    await apply('email', { status: 'Success', message: 'sent' })
    const { email } = await steps()

    expect(email.completed_at).toBeInstanceOf(Date)
    expect(email).not.toHaveProperty('duration_ms')
  })

  it('preserves the message when none is given', async () => {
    await apply('multifoxs', { status: 'Running', message: 'working' })
    await apply('multifoxs', { status: 'Error' })
    const { multifoxs } = await steps()

    expect(multifoxs.status).toBe('Error')
    expect(multifoxs.message).toBe('working')
  })

  it('stores $-prefixed messages literally', async () => {
    await apply('pdb2crd', { status: 'Error', message: '$HOME not set' })
    const { pdb2crd } = await steps()

    expect(pdb2crd.message).toBe('$HOME not set')
  })

  it('clears timing on Waiting', async () => {
    await apply('results', { status: 'Running', message: '' })
    await apply('results', { status: 'Waiting', message: '' })
    const { results } = await steps()

    expect(results.status).toBe('Waiting')
    expect(results).not.toHaveProperty('started_at')
  })

  it('leaves other steps alone', async () => {
    await apply('minimize', { status: 'Success', message: 'min' })
    await apply('heat', { status: 'Running', message: 'heat' })
    const s = await steps()

    expect(s.minimize.status).toBe('Success')
    expect(s.minimize.message).toBe('min')
  })
})
