import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from './appMock.js'
import { User, Job } from '@bilbomd/mongodb-schema'
import crypto from 'crypto'

let server: any

const FIXED_API_TOKEN = '12345trewq12345trewq'

const generateApiToken = (): string => {
  return FIXED_API_TOKEN
}

beforeAll(async () => {
  const apiToken = FIXED_API_TOKEN
  const tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

  await User.create({
    email: 'testuser-status@example.com',
    username: 'apitestuser-status',
    roles: ['User'],
    apiTokens: [
      {
        tokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) // 1 day in the future
      }
    ]
  })

  const user = await User.findOne({ username: 'apitestuser-status' })
  await Job.create({
    title: 'Test Job for Status',
    status: 'Running',
    progress: 100,
    uuid: 'test-uuid-1234',
    submittedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    completedAt: new Date(),
    user: user,
    data_file: 'test_data_file.txt'
  })

  server = app.listen(0)
})

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }
})

describe('/api/v1/external/jobs/:id/status', () => {
  test('should return status of an existing job', async () => {
    const apiToken = generateApiToken()
    const job = await Job.findOne({ title: 'Test Job for Status' })
    const user = await User.findOne({ username: 'apitestuser-status' })

    const res = await request(server)
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
    const apiToken = generateApiToken()

    const res = await request(server)
      .get('/api/v1/external/jobs/invalid-id/status')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid job ID format')
  })

  test('should return 404 if job not found', async () => {
    const apiToken = generateApiToken()
    const randomValidMongoId = '0123456789abcdef01234567' // valid format but no job

    const res = await request(server)
      .get(`/api/v1/external/jobs/${randomValidMongoId}/status`)
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(404)
    expect(res.body.message).toContain('No job found with ID')
  })

  test('should return 401 if Authorization header is missing', async () => {
    const res = await request(server)
      .get('/api/v1/external/jobs/whatever/status')
      .set('Accept', 'application/json')

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Missing or invalid Authorization header')
  })
})
