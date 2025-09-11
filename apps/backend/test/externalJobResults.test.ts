import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from './appMock.js'
import { User, Job } from '@bl1231/bilbomd-mongodb-schema'
import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'

let server: any

const generateApiToken = (): string => {
  return process.env.BILBOMD_API_TOKEN ?? '12345trewq12345trewq'
}

beforeAll(async () => {
  const apiToken = generateApiToken()
  const tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

  await User.create({
    email: 'testuser@example.com',
    username: 'apitestuser',
    roles: ['User'],
    apiTokens: [
      {
        tokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    ]
  })

  const user = await User.findOne({ username: 'apitestuser' })

  const testJob = await Job.create({
    title: 'Test Job for Results',
    status: 'Completed',
    progress: 100,
    uuid: 'test-uuid-results-1234',
    submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    completedAt: new Date(Date.now() - 5 * 60 * 1000),
    user: user?._id,
    data_file: 'test_data_file.txt'
  })

  // Create a dummy result file associated with the job
  const resultDir = path.join('/tmp/bilbomd-data', testJob.uuid)
  await fs.ensureDir(resultDir)
  // await fs.writeFile(
  //   path.join(resultDir, 'results.json'),
  //   JSON.stringify({ test: 'result' })
  // )
  await fs.writeFile(path.join(resultDir, 'results.tar.gz'), 'dummy tarball content')

  server = app.listen(0)
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('/api/v1/external/jobs/:id/results', () => {
  test('should download results tar.gz of an existing job', async () => {
    const apiToken = generateApiToken()
    const job = await Job.findOne({ title: 'Test Job for Results' })

    const res = await request(server)
      .get(`/api/v1/external/jobs/${job?._id}/results`)
      .set('Authorization', `Bearer ${apiToken}`)
      .buffer(true)

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename=".+\.tar\.gz"/
    )
    expect(res.headers['content-type']).toMatch(
      /(application\/gzip|application\/octet-stream)/
    )
    expect(Buffer.isBuffer(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })
  test('should return 400 for invalid job ID', async () => {
    const apiToken = generateApiToken()

    const res = await request(server)
      .get('/api/v1/external/jobs/invalid-id/results')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid job ID format')
  })

  test('should return 404 if job not found', async () => {
    const apiToken = generateApiToken()
    const randomValidMongoId = '0123456789abcdef01234567'

    const res = await request(server)
      .get(`/api/v1/external/jobs/${randomValidMongoId}/results`)
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')

    expect(res.status).toBe(404)
    expect(res.body.message).toContain('No job matches that ID')
  })

  test('should return 401 if Authorization header is missing', async () => {
    const res = await request(server)
      .get('/api/v1/external/jobs/whatever/results')
      .set('Accept', 'application/json')

    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Missing or invalid Authorization header')
  })
})
