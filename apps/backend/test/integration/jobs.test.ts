// Mock spawnAutoRgCalculator at the very top to avoid invoking real Python code during tests.
vi.mock('../../src/controllers/jobs/utils/autoRg.js', () => ({
  spawnAutoRgCalculator: vi.fn(() =>
    Promise.resolve({
      rg: 30,
      rg_min: 25,
      rg_max: 35
    })
  )
}))
vi.mock('../../src/queues/pdb2crd.js', async () => {
  const actual = await vi.importActual('../../src/queues/pdb2crd.js')
  return {
    ...actual,
    waitForJobCompletion: vi.fn().mockResolvedValue(true)
  }
})
import request from 'supertest'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs-extra'
import jwt from 'jsonwebtoken'
import { v4 as uuid } from 'uuid'
import app from '../appMock.js'
import { User, IUser, Job } from '@bilbomd/mongodb-schema'
import { Queue } from 'bullmq'

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

const generateAccessToken = (
  email?: string,
  username = 'testuser1',
  roles: string[] = ['User']
): string => {
  const userEmail = email ?? 'testuser1@example.com'
  const accessTokenPayload: JwtPayload = {
    UserInfo: {
      username,
      roles,
      email: userEmail
    }
  }

  const accessToken: string = jwt.sign(accessTokenPayload, accessTokenSecret, {
    expiresIn: '15m'
  })
  return accessToken
}

const createOtherUser = async (): Promise<IUser> =>
  User.create({
    username: 'testuser2',
    email: 'testuser2@example.com',
    roles: ['User'],
    confirmationCode: {
      code: '67890',
      expiresAt: new Date(Date.now() + 3600000)
    }
  })

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

beforeEach(async () => {
  // Clear collections
  await User.deleteMany({})
  await Job.deleteMany({})

  testUser1 = await User.create({
    username: 'testuser1',
    email: 'testuser1@example.com',
    roles: ['User'],
    confirmationCode: {
      code: '12345',
      expiresAt: new Date(Date.now() + 3600000)
    }
  })
})

describe('BullMQ Queue mock', () => {
  test('should use mocked Queue with expected methods and values', async () => {
    const queue = new Queue('bilbomd')

    // expect(vi.isMockFunction(Queue)).toBe(true)
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
    const res = await request(app).get('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if no jobs found', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(app)
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
    const res = await request(app)
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
    const res = await request(app).get(`/api/v1/jobs/${id}`)
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if jobid doesnt exist', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .get(`/api/v1/jobs/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe(`No job matches ID ${id}.`)
  })
  test('should return success if job is found', async () => {
    const token = generateAccessToken()
    const newJob = await createNewJob(testUser1)
    const res = await request(app)
      .get(`/api/v1/jobs/${newJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })
  test("should return 404 for another user's job", async () => {
    expect.assertions(2)
    const otherUser = await createOtherUser()
    const otherJob = await createNewJob(otherUser)
    const token = generateAccessToken()
    const res = await request(app)
      .get(`/api/v1/jobs/${otherJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe(`No job matches ID ${otherJob._id}.`)
  })
  test("should allow an Admin to read another user's job", async () => {
    const otherUser = await createOtherUser()
    const otherJob = await createNewJob(otherUser)
    const token = generateAccessToken(undefined, 'testuser1', ['Admin'])
    const res = await request(app)
      .get(`/api/v1/jobs/${otherJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
  })
})

describe('POST /api/v1/jobs', () => {
  //Test cases for the POST /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const res = await request(app).post('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if user not found', async () => {
    expect.assertions(2)
    const token = generateAccessToken('nope@nope.com')
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach(
        'pdb_file',
        `${__dirname}/../../../../test_scripts/data/pdb/pro_dna.pdb`
      )
      .attach(
        'inp_file',
        `${__dirname}/../../../../test_scripts/data/pdb/const.inp`
      )
      .attach(
        'dat_file',
        `${__dirname}/../../../../test_scripts/data/pdb/saxs-data.dat`
      )
      .field('title', 'Test Job')
      .field('bilbomd_mode', 'pdb')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('No user found with that email')
  })
  test('should return error if no job type provided', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach(
        'pdb_file',
        `${__dirname}/../../../../test_scripts/data/pdb/pro_dna.pdb`
      )
      .attach(
        'inp_file',
        `${__dirname}/../../../../test_scripts/data/pdb/const.inp`
      )
      .attach(
        'dat_file',
        `${__dirname}/../../../../test_scripts/data/pdb/saxs-data.dat`
      )
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
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .attach(
        'pdb_file',
        `${__dirname}/../../../../test_scripts/data/pdb/pro_dna.pdb`
      )
      .attach(
        'inp_file',
        `${__dirname}/../../../../test_scripts/data/pdb/const.inp`
      )
      .attach(
        'dat_file',
        `${__dirname}/../../../../test_scripts/data/pdb/saxs-data.dat`
      )
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
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'BilboMD Test Job')
      .attach(
        'pdb_file',
        `${__dirname}/../../../../test_scripts/data/pdb/pro_dna.pdb`
      )
      .attach(
        'inp_file',
        `${__dirname}/../../../../test_scripts/data/pdb/const.inp`
      )
      .attach(
        'dat_file',
        `${__dirname}/../../../../test_scripts/data/pdb/saxs-data.dat`
      )
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'pdb')
    // console.log('Queue is mocked:', vi.isMockFunction(Queue))
    // console.log('res----->', res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe(
      'New BilboMD Classic w/PDB Job successfully created'
    )
  })
  test('should return success if new BilboMDAuto job created', async () => {
    expect.assertions(2)
    const token = generateAccessToken()
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'BilboMDAuto Test Job')
      .attach(
        'pdb_file',
        `${__dirname}/../../../../test_scripts/data/auto1/auto1.pdb`
      )
      .attach(
        'pae_file',
        `${__dirname}/../../../../test_scripts/data/auto1/auto1-pae.json`
      )
      .attach(
        'dat_file',
        `${__dirname}/../../../../test_scripts/data/auto1/saxs-data.dat`
      )
      .field('bilbomd_mode', 'auto')
    // console.log('res----->', res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('New BilboMD Auto Job successfully created')
  })
})

describe('POST /api/v1/jobs (resubmit)', () => {
  const pdbData = `${__dirname}/../../../../test_scripts/data/pdb`

  const submitOriginalPdbJob = async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${generateAccessToken()}`)
      .field('title', 'Original Job')
      .attach('pdb_file', `${pdbData}/pro_dna.pdb`)
      .attach('inp_file', `${pdbData}/const.inp`)
      .attach('dat_file', `${pdbData}/saxs-data.dat`)
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'pdb')
      .field('md_engine', 'charmm')
    expect(res.statusCode).toBe(200)
    return res.body as { jobid: string; uuid: string }
  }

  const resubmit = (originalJobId: string, token = generateAccessToken()) =>
    request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'resubmit_Original Job')
      .field('resubmit', 'true')
      .field('original_job_id', originalJobId)
      .field('reuse_pdb_file', 'true')
      .field('reuse_inp_file', 'true')
      .field('reuse_dat_file', 'true')
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'pdb')
      .field('md_engine', 'openmm')

  test('reuses the original files and reprocesses constraints for the new engine', async () => {
    const original = await submitOriginalPdbJob()

    const res = await resubmit(original.jobid)

    expect(res.statusCode).toBe(200)
    const newJob = await Job.findById(res.body.jobid)
    expect(newJob?.get('resubmitted_from')?.toString()).toBe(original.jobid)
    expect(newJob?.get('md_engine')).toBe('OpenMM')
    expect(newJob?.get('const_inp_file')).toBe('openmm_const.yml')
    expect(newJob?.get('md_constraints')).toBeTruthy()
    const newDir = path.join(dataVolume, res.body.uuid)
    expect(await fs.pathExists(path.join(newDir, 'pro_dna.pdb'))).toBe(true)
    expect(await fs.pathExists(path.join(newDir, 'saxs-data.dat'))).toBe(true)
    expect(await fs.pathExists(path.join(newDir, 'openmm_const.yml'))).toBe(
      true
    )
  })

  test("refuses to reuse another user's job", async () => {
    const original = await submitOriginalPdbJob()
    await createOtherUser()

    const res = await resubmit(
      original.jobid,
      generateAccessToken('testuser2@example.com', 'testuser2')
    )

    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('Original job not found')
  })

  test('asks for a re-upload when an original file is gone', async () => {
    const original = await submitOriginalPdbJob()
    await fs.remove(path.join(dataVolume, original.uuid, 'saxs-data.dat'))

    const res = await resubmit(original.jobid)

    expect(res.statusCode).toBe(410)
    expect(res.body.message).toMatch(/saxs-data\.dat.*upload it again/)
  })
})

describe('PATCH /api/v1/jobs', () => {
  //Test cases for the PATCH /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    const res = await request(app).patch('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
})

describe('DELETE /api/v1/jobs/:id', () => {
  //Test cases for the DELETE /api/v1/jobs endpoint
  test('should return error if unauthorized', async () => {
    expect.assertions(2)
    const res = await request(app).delete('/api/v1/jobs')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })

  test('should return 404 if Job ID not found', async () => {
    const token = generateAccessToken()
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .delete(`/api/v1/jobs/${id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe(`No job matches ID ${id}.`)
  })

  test("should return 404 when deleting another user's job", async () => {
    const otherUser = await createOtherUser()
    const otherJob = await createNewJob(otherUser)
    const token = generateAccessToken()
    const res = await request(app)
      .delete(`/api/v1/jobs/${otherJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(404)
    expect(await Job.findById(otherJob._id)).not.toBeNull()
  })

  test('should return 202 if directory is missing (worker will handle)', async () => {
    const token = generateAccessToken()
    const newJob = await createNewJob(testUser1)
    const res = await request(app)
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
    const res = await request(app)
      .delete(`/api/v1/jobs/${newJob._id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.statusCode).toBe(202)
    expect(res.body.message).toMatch(/queued/i)
  })
})

describe('POST /api/v1/jobs (input file names)', () => {
  const crdData = `${__dirname}/../../../../test_scripts/data/crd`
  const pdbData = `${__dirname}/../../../../test_scripts/data/pdb`
  const longLine = `* ${'x'.repeat(120)}`

  // A file just outside any job directory that a crafted field could target
  const plantFile = async (ext: string) => {
    const name = `planted-${uuid()}.${ext}`
    const filePath = path.join(dataVolume, name)
    await fs.writeFile(filePath, `${longLine}\n`)
    return { name, filePath }
  }

  const expectUntouched = async (filePath: string) => {
    expect(await fs.readFile(filePath, 'utf8')).toBe(`${longLine}\n`)
    expect(await fs.pathExists(`${filePath}.orig`)).toBe(false)
    await fs.remove(filePath)
  }

  test('ignores a CRD constraint file name sent as a form field', async () => {
    const planted = await plantFile('inp')

    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${generateAccessToken()}`)
      .field('title', 'Crafted CRD Job')
      .attach('crd_file', `${crdData}/pro_dna.crd`)
      .attach('psf_file', `${crdData}/pro_dna.psf`)
      .attach('dat_file', `${crdData}/saxs-data.dat`)
      .field('inp_file', `../${planted.name}`)
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'crd_psf')

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Validation failed')
    await expectUntouched(planted.filePath)
  })

  test('ignores a data file name sent as a form field', async () => {
    const planted = await plantFile('dat')

    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${generateAccessToken()}`)
      .field('title', 'Crafted PDB Job')
      .attach('pdb_file', `${pdbData}/pro_dna.pdb`)
      .attach('inp_file', `${pdbData}/const.inp`)
      .field('dat_file', `../${planted.name}`)
      .field('rg', 35)
      .field('rg_min', 30)
      .field('rg_max', 40)
      .field('num_conf', 1)
      .field('bilbomd_mode', 'pdb')

    expect(res.statusCode).toBe(400)
    // Treated as missing, not as a (failed) reference to the planted file
    expect(res.body.errors).toContainEqual({
      path: 'dat_file',
      message: 'Experimental SAXS data is required'
    })
    await expectUntouched(planted.filePath)
  })
})
