import request from 'supertest'
import { describe, test, expect, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import app from '../appMock.js'
import { User } from '@bilbomd/mongodb-schema'

require('dotenv').config()

describe('POST /api/v1/magicklink', () => {
  let confirmationCode: string

  beforeEach(async () => {
    // Clear users collection before each test
    await User.deleteMany({})

    // Register a user to get confirmation code for magic link tests
    const res = await request(app)
      .post('/api/v1/register')
      .send({ user: 'testuser1', email: 'testuser1@example.com' })
    confirmationCode = res.body.code
  })

  test('should return error if no user or email provided', async () => {
    const res = await request(app)
      .post('/api/v1/magicklink')
      .send({ email: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('email is required')
  })
  test('Should return error when email not in DB', async () => {
    const res = await request(app)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('no account with that email')
  })
  test('Should return error if user is Pending', async () => {
    const res = await request(app)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser1@example.com' })
    expect(res.statusCode).toBe(403)
    expect(res.body.message).toBe('Pending')
  })
  test('Should verify confirmation code and request OTP', async () => {
    const res = await request(app)
      .post('/api/v1/verify')
      .send({ code: confirmationCode })
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Verified')
    const res2 = await request(app)
      .post('/api/v1/magicklink')
      .send({ email: 'testuser1@example.com' })
    expect(res2.statusCode).toBe(201)
    expect(res2.body.success).toBe('OTP created for testuser1@example.com')
  })
})
