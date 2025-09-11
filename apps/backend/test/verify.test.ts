import request from 'supertest'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import app from './appMock'
import { User } from '@bl1231/bilbomd-mongodb-schema'
// import { closeQueue } from '../src/queues/bilbomd'
import dotenv from 'dotenv'

dotenv.config()

let server: any // Adjust the type as needed.

beforeAll(async () => {
  server = app.listen(0)
  await User.create({
    username: 'testuser3',
    email: 'testuser3@example.com',
    roles: ['User'],
    confirmationCode: {
      code: 'eFHfeP7USO7xK5K4PKasrvh2ZxlwPvCEMFTW',
      expiresAt: new Date(Date.now() + 3600000)
    }
  })
})

afterAll(async () => {
  await User.deleteOne({ username: 'testuser3' })
  await new Promise((resolve) => server.close(resolve))
})

describe('POST /api/v1/verify', () => {
  test('should return error if no verification code provided', async () => {
    const res = await request(server).post('/api/v1/verify').send({ code: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Confirmation code required.')
  })

  test('Should return error if no user found with that verification code', async () => {
    const res = await request(server).post('/api/v1/verify').send({ code: '54321' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Unable to verify 54321.')
  })

  test('Should return verification success', async () => {
    const res = await request(server)
      .post('/api/v1/verify')
      .send({ code: 'eFHfeP7USO7xK5K4PKasrvh2ZxlwPvCEMFTW' })
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Verified')
  })
})

describe('POST /api/v1/verify/resend', () => {
  test('should return error if email key is missing', async () => {
    const res = await request(server).post('/api/v1/verify/resend').send({ nope: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Email required.')
  })

  test('should return error if email key is missing but email is provided', async () => {
    const res = await request(server)
      .post('/api/v1/verify/resend')
      .send({ nope: 'testuser3@example.com' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Email required.')
  })

  test('should return error if email missing', async () => {
    const res = await request(server).post('/api/v1/verify/resend').send({ email: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Email required.')
  })

  test('Should return error if no user found with that email', async () => {
    const res = await request(server)
      .post('/api/v1/verify/resend')
      .send({ email: 'nope@example.com' })
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('No user with that email.')
  })

  test('Should return success', async () => {
    const res = await request(server)
      .post('/api/v1/verify/resend')
      .send({ email: 'testuser3@example.com' })
    expect(res.statusCode).toBe(201)
    expect(res.body.message).toBe('OK')
  })
})
