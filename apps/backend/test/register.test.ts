import request from 'supertest'
import mongoose from 'mongoose'
import app from './appMock'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { User } from '@bl1231/bilbomd-mongodb-schema'
// import { closeQueue } from '../src/queues/bilbomd'

let server: any
import dotenv from 'dotenv'

dotenv.config()

beforeAll(async () => {
  server = app.listen(0)
  await User.deleteMany()
  await User.create({
    username: 'testuser1',
    email: 'testuser1@example.com',
    roles: ['User'],
    confirmationCode: { code: '12345', expiresAt: new Date(Date.now() + 3600000) }
  })
})

afterAll(async () => {
  await User.deleteOne({ username: 'testuser1' })
  await User.deleteOne({ username: 'testuser2' })
  await new Promise((resolve) => server.close(resolve))
})

describe('POST /api/v1/register', () => {
  test('should return error if no user or email provided', async () => {
    const res = await request(server)
      .post('/api/v1/register')
      .send({ user: '', email: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Username and email are required.')
  })

  test('Should return error when duplicate username provided', async () => {
    const res = await request(server)
      .post('/api/v1/register')
      .send({ user: 'testuser1', email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Duplicate username')
  })

  test('Should return error when duplicate email provided', async () => {
    const res = await request(server)
      .post('/api/v1/register')
      .send({ user: 'testuser2', email: 'testuser1@example.com' })
    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Duplicate email')
  })

  test('Should create new user', async () => {
    const res = await request(server)
      .post('/api/v1/register')
      .send({ user: 'testuser2', email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(`New user testuser2 created!`)
  })

  test('Should give error if new user is malformed', async () => {
    const res = await request(server)
      .post('/api/v1/register')
      .send({ userr: 'testuser2', emailack: 'testuser2@example.com' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Username and email are required.')
  })
})
