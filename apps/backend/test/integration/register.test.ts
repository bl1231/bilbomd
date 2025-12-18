import request from 'supertest'
import app from '../appMock.js'
import { describe, test, expect, beforeEach } from 'vitest'
import { User } from '@bilbomd/mongodb-schema'

describe('POST /api/v1/register', () => {
  test('should return error if no user or email provided', async () => {
    const res = await request(app)
      .post('/api/v1/register')
      .send({ user: '', email: '' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Username and email are required.')
  })

  test('Should return error when duplicate username provided', async () => {
    // Create existing user first
    await User.create({
      username: 'testuser1',
      email: 'testuser1@example.com',
      roles: ['User']
    })

    const res = await request(app)
      .post('/api/v1/register')
      .send({ user: 'testuser1', email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Duplicate username')
  })

  test('Should return error when duplicate email provided', async () => {
    // Create existing user first
    await User.create({
      username: 'testuser1',
      email: 'testuser1@example.com',
      roles: ['User']
    })

    const res = await request(app)
      .post('/api/v1/register')
      .send({ user: 'testuser2', email: 'testuser1@example.com' })
    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Duplicate email')
  })

  test('Should create new user', async () => {
    const res = await request(app)
      .post('/api/v1/register')
      .send({ user: 'testuser2', email: 'testuser2@example.com' })
    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(`New user testuser2 created!`)
  })

  test('Should give error if new user is malformed', async () => {
    const res = await request(app)
      .post('/api/v1/register')
      .send({ userr: 'testuser2', emailack: 'testuser2@example.com' })
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('Username and email are required.')
  })
})
