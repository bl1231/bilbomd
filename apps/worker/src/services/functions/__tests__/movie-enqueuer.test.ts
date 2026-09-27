import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { Job as BullMQJob } from 'bullmq'
import type { IJob } from '@bilbomd/mongodb-schema'

const { state, updateOneMock, addMock } = vi.hoisted(() => ({
  state: { uploadDir: '' },
  updateOneMock: vi.fn(),
  addMock: vi.fn()
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    get uploadDir() {
      return state.uploadDir
    }
  }
}))
vi.mock('../../../queues/movie.js', () => ({
  movieQueue: { add: addMock }
}))
vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { updateOne: updateOneMock }
}))
vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn()
}))
vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { enqueueMakeMovie } from '../movie-enqueuer.js'
import { notifyJobChanged } from '../../../helpers/jobEvents.js'

const MQjob = { log: vi.fn() } as unknown as BullMQJob
const DBJob = {
  _id: 'job-id',
  uuid: 'job-uuid',
  user: { _id: 'owner-1' }
} as unknown as IJob

const addRun = async (label: string) => {
  const runDir = path.join(state.uploadDir, 'job-uuid', 'openmm', 'md', label)
  await fs.ensureDir(runDir)
  await fs.writeFile(path.join(runDir, 'md.pdb'), '')
  await fs.writeFile(path.join(runDir, 'md.dcd'), '')
}

beforeEach(async () => {
  vi.clearAllMocks()
  state.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-enq-'))
  updateOneMock.mockResolvedValue({ matchedCount: 1 })
  addMock.mockResolvedValue({})
})

afterEach(async () => {
  await fs.remove(state.uploadDir)
})

describe('enqueueMakeMovie', () => {
  it("publishes one 'movies' event once the movies are queued", async () => {
    await addRun('rg_25')
    await addRun('rg_30')

    await enqueueMakeMovie(MQjob, DBJob)

    expect(addMock).toHaveBeenCalledTimes(2)
    expect(notifyJobChanged).toHaveBeenCalledExactlyOnceWith(DBJob, 'movies')
    // after the movies were written to the job, not before
    expect(
      vi.mocked(notifyJobChanged).mock.invocationCallOrder[0]
    ).toBeGreaterThan(updateOneMock.mock.invocationCallOrder.at(-1)!)
  })

  it('publishes nothing when there are no MD runs to render', async () => {
    await fs.ensureDir(path.join(state.uploadDir, 'job-uuid', 'openmm', 'md'))

    await enqueueMakeMovie(MQjob, DBJob)

    expect(notifyJobChanged).not.toHaveBeenCalled()
  })
})
