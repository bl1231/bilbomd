import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { Job } from '@bilbomd/mongodb-schema'
import { updateStepStatus, updateJobStatus } from '../mongo-utils.js'

vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))

// No database needed: a hydrated document tracks modified paths the same way
// a loaded one does, and save() writes exactly those paths.
describe('updateStepStatus (change tracking)', () => {
  const loaded = (steps?: Record<string, unknown>) => {
    const job = Job.hydrate({
      _id: new mongoose.Types.ObjectId(),
      title: 'timing',
      steps
    })
    vi.spyOn(job, 'updateOne').mockResolvedValue(
      {} as Awaited<ReturnType<typeof job.updateOne>>
    )
    return job
  }

  it('leaves no pending step change for a later save', async () => {
    const job = loaded({
      minimize: { status: 'Running', started_at: new Date() }
    })

    await updateStepStatus(job, 'minimize', { status: 'Success' })

    expect(job.steps.minimize.status).toBe('Success')
    expect(job.modifiedPaths()).toEqual([])
  })

  it('leaves no pending change when it creates the steps object', async () => {
    const job = loaded()

    await updateStepStatus(job, 'heat', { status: 'Running' })

    expect(job.steps.heat.status).toBe('Running')
    expect(job.modifiedPaths()).toEqual([])
  })

  it('does not hide unrelated pending changes', async () => {
    const job = loaded({ minimize: { status: 'Running' } })
    job.progress = 40

    await updateStepStatus(job, 'minimize', { status: 'Success' })

    expect(job.modifiedPaths()).toEqual(['progress'])
  })
})

// Runs against a real MongoDB when MONGO_TEST_URI is set, e.g.
//   docker run --rm -d --name worker-it-mongo -p 29018:27017 mongo:8.3.8
//   MONGO_TEST_URI=mongodb://localhost:29018/worker-it pnpm -F @bilbomd/worker test
const uri = process.env.MONGO_TEST_URI

describe.skipIf(!uri)('updateStepStatus (against MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string)
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  const stored = async (id: mongoose.Types.ObjectId) =>
    (await Job.collection.findOne({ _id: id }))?.steps

  const newJob = (steps?: Record<string, unknown>) =>
    Job.create({
      title: 'timing',
      uuid: `uuid-${new mongoose.Types.ObjectId().toString()}`,
      data_file: 'saxs.dat',
      access_mode: 'anonymous',
      public_id: 'pub',
      client_ip_hash: 'hash',
      steps
    })

  const expectTimed = (step: Record<string, unknown>) => {
    expect(step.status).toBe('Success')
    expect(step.started_at).toBeInstanceOf(Date)
    expect(step.completed_at).toBeInstanceOf(Date)
    expect(step.duration_ms).toEqual(expect.any(Number))
  }

  it('keeps step timing when the job is saved afterwards', async () => {
    const created = await newJob({
      minimize: { status: 'Waiting' },
      heat: { status: 'Waiting' }
    })
    const job = await Job.findById(created._id).orFail()

    await updateStepStatus(job, 'minimize', { status: 'Running' })
    await updateStepStatus(job, 'minimize', { status: 'Success' })
    await updateStepStatus(job, 'heat', { status: 'Running' })

    job.progress = 50
    await job.save()

    const steps = await stored(job._id)
    expectTimed(steps.minimize)
    expect(steps.heat.status).toBe('Running')
    expect(steps.heat.started_at).toBeInstanceOf(Date)
    expect((await Job.findById(job._id).orFail()).progress).toBe(50)
  })

  it('keeps timing when the job had no steps yet', async () => {
    const created = await newJob()
    await Job.collection.updateOne(
      { _id: created._id },
      { $unset: { steps: 1 } }
    )
    const job = await Job.findById(created._id).orFail()

    await updateStepStatus(job, 'pdb2crd', { status: 'Running' })
    await updateStepStatus(job, 'pdb2crd', { status: 'Success' })
    await updateJobStatus(job, 'Completed')

    expectTimed((await stored(job._id)).pdb2crd)
  })
})
