import request from 'supertest'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import app from './appMock'
import { User } from '@bl1231/bilbomd-mongodb-schema'

require('dotenv').config()

describe('POST /api/v1/magicklink', () => {
  let server: any
  let confirmationCode: string
  beforeAll(async () => {
    server = app.listen(0, () => {})
    const res = await request(server)
      .post('/api/v1/register')
      .send({ user: 'testuser1', email: 'testuser1@example.com' })
    confirmationCode = res.body.code
  })

  afterAll(async () => {
    await User.deleteOne({ username: 'testuser1' })
    await mongoose.disconnect()
    await new Promise((resolve) => server.close(resolve))
  })

  test('should return error if no user or email provided', async () => {
    const res = await request(server).post('/api/v1/magicklink').send({ email: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('email is required')
  })
  test('Should return error when email not in DB', async () => {
    const res = await request(server)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('no account with that email')
  })
  test('Should return error if user is Pending', async () => {
    const res = await request(server)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser1@example.com' })
    expect(res.statusCode).toBe(403)
    expect(res.body.message).toBe('Pending')
  })
  test('Should verify confirmation code and request OTP', async () => {
    const res = await request(server)
      .post('/api/v1/verify')
      .send({ code: confirmationCode })
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Verified')
    const res2 = await request(server)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser1@example.com' })
    expect(res2.statusCode).toBe(201)
    expect(res2.body.success).toBe('OTP created for testuser1@example.com')
  })
})
