import { describe, test, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../appMock.js'
import { User, Job } from '@bilbomd/mongodb-schema'
import { seedApiTokenUser } from '../helpers/seedApiTokenUser.js'

let apiTokenForTests: string

beforeEach(async () => {
  // Clear collections before each test
  await User.deleteMany({})
  await Job.deleteMany({})

  const seeded = await seedApiTokenUser({
    email: 'testuser-status@example.com',
    username: 'apitestuser-status'
  })
  apiTokenForTests = seeded.token

  const user = await User.findOne({ username: 'apitestuser-status' })
  await Job.create({
    title: 'Test Job for Status',
    status: 'Running',
    progress: 100,
    uuid: 'test-uuid-1234',
    submittedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    completedAt: new Date(),
    user: {
      _id: user?._id,
      username: user?.username,
      email: user?.email
    },
    data_file: 'test_data_file.txt'
  })
})

describe('/api/v1/external/jobs/:id/status', () => {
  test('should return status of an existing job', async () => {
    const apiToken = apiTokenForTests
    const job = await Job.findOne({ title: 'Test Job for Status' })
    const user = await User.findOne({ username: 'apitestuser-status' })

    const res = await request(app)
      .get(`/api/v1/external/jobs/${job?._id}/status`)
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(
      res.status,
      `Expected 200 but got ${res.status}. Response body: ${JSON.stringify(res.body)}. Job ID: ${job?._id}. User IDs - job: ${job?.user}, api: ${user?._id}`
    ).toBe(200)
    expect(res.body).toHaveProperty('status')
    expect(res.body.status).toBe('Running')
  })

  test('should return 400 for invalid job ID', async () => {
    const apiToken = apiTokenForTests

    const res = await request(app)
      .get('/api/v1/external/jobs/invalid-id/status')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid job ID format')
  })

  test('should return 404 if job not found', async () => {
    const apiToken = apiTokenForTests
    const randomValidMongoId = '0123456789abcdef01234567' // valid format but no job

    const res = await request(app)
      .get(`/api/v1/external/jobs/${randomValidMongoId}/status`)
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(404)
    expect(res.body.message).toContain('No job found with ID')
  })

  test('should return 401 if Authorization header is missing', async () => {
    const res = await request(app)
      .get('/api/v1/external/jobs/whatever/status')
      .set('Accept', 'application/json')

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Missing or invalid Authorization header')
  })
})
