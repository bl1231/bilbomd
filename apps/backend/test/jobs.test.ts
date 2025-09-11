// Mock spawnAutoRgCalculator at the very top to avoid invoking real Python code during tests.
vi.mock('../src/controllers/jobs/utils/autoRg.js', () => ({
  spawnAutoRgCalculator: vi.fn(() =>
    Promise.resolve({
      rg: 30,
      rg_min: 25,
      rg_max: 35
    })
  )
}))
vi.mock('../src/queues/pdb2crd.js', async () => {
  const actual = await vi.importActual('../src/queues/pdb2crd.js')
  return {
    ...actual,
    waitForJobCompletion: vi.fn().mockResolvedValue(true)
  }
})
import request from 'supertest'
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs-extra'
import jwt from 'jsonwebtoken'
import { v4 as uuid } from 'uuid'
import app from './appMock'
import { User, IUser, Job } from '@bl1231/bilbomd-mongodb-schema'
import { Queue } from 'bullmq'

let server: any
let testUser1: IUser

const accessTokenSecret: string = process.env.ACCESS_TOKEN_SECRET ?? ''
const dataVolume: string = process.env.DATA_VOL ?? ''

interface JwtPayload {
  UserInfo: BilboMDJwtPayload
}

interface BilboMDJwtPayload {
  username: string
  roles: string[]
  email: string
}

interface JobType {
  mongo: {
    __v: number
    _id: string
    crd_file: string
    createdAt: string
    data_file: string
    psf_file: string
    status: string
    time_submitted: string
    title: string
    updatedAt: string
    user: string
    uuid: string
  }
  username: string
}

const generateAccessToken = (email?: string): string => {
  const userEmail = email ?? 'testuser1@example.com'
  const accessTokenPayload: JwtPayload = {
    UserInfo: {
      username: 'testuser1',
      roles: ['User'],
      email: userEmail
    }
  }

  const accessToken: string = jwt.sign(accessTokenPayload, accessTokenSecret, {
    expiresIn: '15m'
  })
  return accessToken
}

const createNewJob = async (user: IUser) => {
  const now = new Date()
  const UUID = uuid()
  const jobDir = path.join(dataVolume, UUID)
  const job = {
    title: 'test job',
    uuid: UUID,
    psf_file: `${jobDir}/pro_dna_complex.psf`,
    crd_file: `${jobDir}/pro_dna_complex.crd`,
    const_inp_file: `${jobDir}/my_const.inp`,
    data_file: `${jobDir}/pro_dna_saxs.dat`,
    conformational_sampling: 1,
    rg_min: 25,
    rg_max: 35,
    status: 'Submitted',
    time_submitted: now,
    user: user
  }
  // console.log(job)
  const createdJob = await Job.create(job)
  return createdJob
}

beforeAll(async () => {
  server = app.listen(0)
  await User.deleteMany()
  await Job.deleteMany()

  testUser1 = await User.create({
    username: 'testuser1',
    email: 'testuser1@example.com',
    roles: ['User'],
    confirmationCode: { code: '12345', expiresAt: new Date(Date.now() + 3600000) }
  })
})

afterAll(async () => {
  await User.deleteMany()
  await Job.deleteMany()
  await new Promise((resolve) => server.close(resolve))
})

describe('BullMQ Queue mock', () => {
  test('should use mocked Queue with expected methods and values', async () => {
    const queue = new Queue('bilbomd')

    expect(vi.isMockFunction(Queue)).toBe(true)
    expect(queue.name).toBe('bilbomd-mock')

    const data = { foo: 'bar' }
    const job = await queue.add('mock-job', data)

    expect(job).toBeDefined()
    expect(job.id).toBe('mock-job-id')
    expect(job.name).toBe('mock-job')
    expect(job.data).toEqual(data)
  })
})

describe('GET /api/v1/jobs', () => {
  //Test cases for the GET /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const res = await request(server).get('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if no jobs found', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
    console.log('no jobs', res.statusCode, res.body)
    expect(res.statusCode).toBe(204)
    expect(res.body).toEqual({})
  })
  test('should return success with list of jobs', async () => {
    expect.assertions(3)
    await createNewJob(testUser1)
    const token = generateAccessToken()
    const res = await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(200)
    // console.log(res.body)
    expect(res.body).toBeDefined()
    const jobsArray: JobType[] = res.body
    const matchingJob = jobsArray.find(
      (job) => job.mongo.title === 'test job' && job.username === 'testuser1'
    )
    expect(matchingJob).toBeDefined()
  })
})

describe('GET /api/v1/jobs/:id', () => {
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(server).get(`/api/v1/jobs/${id}`)
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if jobid doesnt exist', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(server)
      .get(`/api/v1/jobs/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe(`No job matches ID ${id}.`)
  })
  test('should return success if job is found', async () => {
    const token = generateAccessToken()
    const newJob = await createNewJob(testUser1)
    const res = await request(server)
      .get(`/api/v1/jobs/${newJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })
})

describe('POST /api/v1/jobs', () => {
  //Test cases for the POST /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const res = await request(server).post('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if user not found', async () => {
    expect.assertions(2)
    const token = generateAccessToken('nope@nope.com')
    const res = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdb_file', `${__dirname}/data/pdb/pro_dna.pdb`)
      .attach('inp_file', `${__dirname}/data/pdb/const.inp`)
      .attach('dat_file', `${__dirname}/data/pdb/saxs-data.dat`)
      .field('title', 'Test Job')
      .field('bilbomd_mode', 'pdb')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('No user found with that email')
  })
  test('should return error if no job type provided', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdb_file', `${__dirname}/data/pdb/pro_dna.pdb`)
      .attach('inp_file', `${__dirname}/data/pdb/const.inp`)
      .attach('dat_file', `${__dirname}/data/pdb/saxs-data.dat`)
      .field('title', 'Test Job')
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('No job type provided')
  })
  test('should return error if wrong job type provided', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach('pdb_file', `${__dirname}/data/pdb/pro_dna.pdb`)
      .attach('inp_file', `${__dirname}/data/pdb/const.inp`)
      .attach('dat_file', `${__dirname}/data/pdb/saxs-data.dat`)
      .field('title', 'Test Job')
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'nope')
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Invalid job type')
  })
  test('should return success if new BilboMD job created', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'BilboMD Test Job')
      .attach('pdb_file', `${__dirname}/data/pdb/pro_dna.pdb`)
      .attach('inp_file', `${__dirname}/data/pdb/const.inp`)
      .attach('dat_file', `${__dirname}/data/pdb/saxs-data.dat`)
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'pdb')
    // console.log('Queue is mocked:', vi.isMockFunction(Queue))
    // console.log('res----->', res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('New pdb Job successfully created')
  })
  test('should return success if new BilboMDAuto job created', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'BilboMDAuto Test Job')
      .attach('pdb_file', `${__dirname}/data/auto1/auto1.pdb`)
      .attach('pae_file', `${__dirname}/data/auto1/auto1-pae.json`)
      .attach('dat_file', `${__dirname}/data/auto1/saxs-data.dat`)
      .field('bilbomd_mode', 'auto')
    // console.log('res----->', res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('New auto Job successfully created')
  })
})

describe('PATCH /api/v1/jobs', () => {
  //Test cases for the PATCH /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    const res = await request(server).patch('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
})

describe('DELETE /api/v1/jobs/:id', () => {
  //Test cases for the DELETE /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const res = await request(server).delete('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })

  test('should return 202 if Job ID not found (still queued)', async () => {
    const token = generateAccessToken()
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(server)
      .delete(`/api/v1/jobs/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(202)
    expect(res.body.message).toMatch(/queued/i)
  })

  test('should return 202 if directory is missing (worker will handle)', async () => {
    const token = generateAccessToken()
    const newJob = await createNewJob(testUser1)
    const res = await request(server)
      .delete(`/api/v1/jobs/${newJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(202)
    expect(res.body.message).toMatch(/queued/i)
  })

  test('should return 202 when Job exists and directory is present', async () => {
    const token = generateAccessToken()
    const newJob = await createNewJob(testUser1)
    const jobDir = path.join(dataVolume, newJob.uuid)
    await fs.mkdir(jobDir, { recursive: true })
    const res = await request(server)
      .delete(`/api/v1/jobs/${newJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(202)
    expect(res.body.message).toMatch(/queued/i)
  })
})
