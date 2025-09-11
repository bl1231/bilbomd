import request from 'supertest'
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach
} from 'vitest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { v4 as uuid } from 'uuid'
import app from './appMock'
import { User, IUser, Job } from '@bl1231/bilbomd-mongodb-schema'

const accessTokenSecret: string = process.env.ACCESS_TOKEN_SECRET ?? ''

interface JwtPayload {
  UserInfo: BilboMDJwtPayload
}

interface BilboMDJwtPayload {
  username: string
  roles: string[]
  email: string
}

// interface AccessToken {
//   accessToken: string
// }

interface MyJob {
  conformational_sampling: number
  const_inp_file: string
  crd_file: string
  data_file: string
  psf_file: string
  rg_max: number
  rg_min: number
  status: string
  time_submitted: Date
  title: string
  user: IUser
  uuid: string
}

interface MyUser {
  id: string
  username: string
  roles: string[]
  active: boolean
  email: string
}

let server: any

const generateValidToken = (): string => {
  const accessTokenPayload: JwtPayload = {
    UserInfo: {
      username: 'testuser1',
      roles: ['User'],
      email: 'testuser1@example.com'
    }
  }

  const accessToken: string = jwt.sign(accessTokenPayload, accessTokenSecret, {
    expiresIn: '15m'
  })
  // const accessTokenData: AccessToken = {
  //   accessToken
  // }
  return accessToken
}

const createNewJob = async (user: IUser) => {
  const now = new Date()
  const UUID = uuid()
  const job: MyJob = {
    title: 'test job',
    uuid: UUID,
    psf_file: 'file.psf',
    crd_file: 'file.crd',
    const_inp_file: 'const.inp',
    data_file: 'saxs.dat',
    conformational_sampling: 1,
    rg_min: 25,
    rg_max: 35,
    status: 'Submitted',
    time_submitted: now,
    user: user
  }
  const createdJob = await Job.create(job)
  return createdJob
}

beforeAll(async () => {
  server = app.listen(0)
  await User.deleteMany()
  await Job.deleteMany()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('GET /api/v1/users', () => {
  let testUser1: IUser // Declare a variable to store the test user
  let testUser2: IUser // Declare a variable to store the test user

  beforeEach(async () => {
    // Create the test user and store it in the variable
    testUser1 = await User.create({
      username: 'testuser1',
      email: 'testuser1@example.com',
      roles: ['User'],
      confirmationCode: { code: '12345', expiresAt: new Date(Date.now() + 3600000) }
    })
    testUser2 = await User.create({
      username: 'testuser2',
      email: 'testuser2@example.com',
      roles: ['User'],
      confirmationCode: { code: '54321', expiresAt: new Date(Date.now() + 3600000) }
    })
  })
  afterEach(async () => {
    // Delete the test user after each test case
    await User.deleteOne({ _id: testUser1._id })
    await User.deleteOne({ _id: testUser2._id })
  })
  test('should return error if we are unauthorized', async () => {
    const res = await request(server).get('/api/v1/users')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return users', async () => {
    const token = generateValidToken()
    // console.log('token--->', token)
    const res = await await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    // console.log(res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBeDefined()
    // Check if testuser1 and testuser2 are present in the response body
    expect(res.body.data).toContainEqual(
      expect.objectContaining({ username: 'testuser1' })
    )
    expect(res.body.data).toContainEqual(
      expect.objectContaining({ username: 'testuser2' })
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('PATCH /api/v1/users', () => {
  // Test cases for the PATCH /api/v1/users endpoint
  // jest.setTimeout(5000)
  let testUser1: IUser
  let token: string
  beforeEach(async () => {
    token = generateValidToken()
    // Create the test user and store it in the variable
    testUser1 = await User.create({
      username: 'testuser1',
      email: 'testuser1@example.com',
      roles: ['User'],
      confirmationCode: { code: '12345', expiresAt: new Date(Date.now() + 3600000) }
    })
  })
  afterEach(async () => {
    // Delete the test user after each test case
    await User.deleteOne({ _id: testUser1._id })
  })
  test('should return error if we are unauthorized', async () => {
    const res = await request(server).patch('/api/v1/users')
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if you dont provide valid user object', async () => {
    const token = generateValidToken()
    const res = await await request(server)
      .patch('/api/v1/users')
      .send({})
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    // console.log(res.body)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('User ID is required')
  })
  test('should return error if user is not found', async () => {
    // const token = generateValidToken()
    const id = new mongoose.Types.ObjectId().toString()
    const user: MyUser = {
      id: id,
      username: testUser1.username,
      roles: testUser1.roles,
      active: testUser1.active,
      email: testUser1.email
    }

    const res = await await request(server)
      .patch('/api/v1/users')
      .send(user)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('User not found')
  })
  test('should return success if user is updated', async () => {
    const user: MyUser = {
      id: testUser1._id.toString(),
      username: testUser1.username,
      roles: testUser1.roles,
      active: testUser1.active,
      email: 'updated@example.com'
    }

    const res = await await request(server)
      .patch('/api/v1/users')
      .send(user)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe(`${user.username} updated`)
  })
})

describe('DELETE /api/v1/users', () => {
  // Test cases for the DELETE /api/v1/users endpoint
  // jest.setTimeout(5000)
  let testUser1: IUser
  let token: string
  beforeEach(async () => {
    token = generateValidToken()
    // Create the test user and store it in the variable
    testUser1 = await User.create({
      username: 'testuser1',
      email: 'testuser1@example.com',
      roles: ['User'],
      confirmationCode: { code: '12345', expiresAt: new Date(Date.now() + 3600000) }
    })
  })
  afterEach(async () => {
    // Delete the test user after each test case
    await User.deleteOne({ _id: testUser1._id })
  })
  test('should return error if we are unauthorized', async () => {
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(server).delete('/api/v1/users').send({ id })
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Unauthorized')
  })
  test('should return error if user has a Job', async () => {
    await createNewJob(testUser1)
    const res = await request(server)
      .delete(`/api/v1/users/${testUser1._id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('User has jobs')
    await Job.deleteMany()
  })
  test('should return error if user does not exist', async () => {
    const id = new mongoose.Types.ObjectId().toString()
    const res = await request(server)
      .delete(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('User not found')
  })
  test('should return success if user is deleted', async () => {
    const res = await request(server)
      .delete(`/api/v1/users/${testUser1._id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe(
      `Username ${testUser1.username} with ID ${testUser1._id} deleted`
    )
  })
})
