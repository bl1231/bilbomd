// Mock spawnAutoRgCalculator at the very top to avoid invoking real Python code during tests
vi.mock('../src/controllers/jobs/utils/autoRg.js', () => ({
  spawnAutoRgCalculator: vi.fn(() =>
    Promise.resolve({
      rg: 30,
      rg_min: 25,
      rg_max: 35
    })
  )
}))
vi.mock('../src/queues/pdb2crd.js', async () => {
  const actual = await vi.importActual('../src/queues/pdb2crd.js')
  return {
    ...actual,
    waitForJobCompletion: vi.fn().mockResolvedValue(true)
  }
})
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import app from './appMock.js'
import path from 'path'
import { User } from '@bl1231/bilbomd-mongodb-schema'
import crypto from 'crypto'

const expectSuccessfulJobResponse = (res: request.Response, expectedMessage: string) => {
  expect(res.status).toBe(200)

  expect(res.body).toHaveProperty('message', expectedMessage)
  expect(res.body).toHaveProperty('jobid')
  expect(res.body).toHaveProperty('uuid')

  expect(typeof res.body.jobid).toBe('string')
  expect(res.body.jobid).toMatch(/^[a-f0-9]{24}$/)

  expect(typeof res.body.uuid).toBe('string')
  expect(res.body.uuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  )
}

let server: any

const generateApiToken = (): string => {
  return process.env.BILBOMD_API_TOKEN ?? '12345trewq12345trewq'
}

beforeAll(async () => {
  const apiToken = process.env.BILBOMD_API_TOKEN ?? '12345trewq12345trewq'
  const tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex')

  await User.create({
    email: 'testuser@example.com',
    username: 'apitestuser',
    roles: ['User'],
    apiTokens: [
      {
        tokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) // 1 day in future
      }
    ]
  })
  server = app.listen(0)
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('/api/v1/external/jobs', () => {
  test('should inform us that the API Token is missing', async () => {
    const apiToken = generateApiToken()
    const res = await request(server).get('/api/v1/external/jobs')
    console.log('sanity test res:', res.body)
    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Missing or invalid Authorization header')
  })
  test('should verify that the external API Token protected route is alive', async () => {
    const apiToken = generateApiToken()
    const res = await request(server)
      .get('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
    console.log('sanity test res:', res.body)
    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('External API route is working.')
  })
  test('should submit a BilboMD auto job successfully', async () => {
    const apiToken = generateApiToken()

    const pdbFilePath = path.resolve(__dirname, '../test/data/auto1/auto1.pdb')
    const datFilePath = path.resolve(__dirname, '../test/data/auto1/saxs-data.dat')
    const paeFilePath = path.resolve(__dirname, '../test/data/auto1/auto1-pae.json')

    const res = await request(server)
      .post('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')
      .field('bilbomd_mode', 'auto')
      .field('title', 'API Test Job Auto1')
      .attach('pdb_file', pdbFilePath)
      .attach('dat_file', datFilePath)
      .attach('pae_file', paeFilePath)
    expectSuccessfulJobResponse(res, 'New auto Job successfully created')
  })
  test('should submit a BilboMD classic PDB job successfully', async () => {
    const apiToken = generateApiToken()

    const pdbFilePath = path.resolve(__dirname, '../test/data/pdb/pro_dna.pdb')
    const datFilePath = path.resolve(__dirname, '../test/data/pdb/saxs-data.dat')
    const inpFilePath = path.resolve(__dirname, '../test/data/pdb/const.inp')

    const res = await request(server)
      .post('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')
      .field('bilbomd_mode', 'pdb')
      .field('title', 'API Test Job PDB')
      .attach('pdb_file', pdbFilePath)
      .attach('dat_file', datFilePath)
      .attach('inp_file', inpFilePath)
    expectSuccessfulJobResponse(res, 'New pdb Job successfully created')
  })
  test('should submit a BilboMD classic CRD job successfully', async () => {
    const apiToken = generateApiToken()

    const crdFilePath = path.resolve(__dirname, '../test/data/crd/pro_dna.crd')
    const psfFilePath = path.resolve(__dirname, '../test/data/crd/pro_dna.psf')
    const datFilePath = path.resolve(__dirname, '../test/data/crd/saxs-data.dat')
    const inpFilePath = path.resolve(__dirname, '../test/data/crd/const.inp')

    const res = await request(server)
      .post('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')
      .field('bilbomd_mode', 'crd_psf')
      .field('title', 'API Test Job CRD')
      .attach('crd_file', crdFilePath)
      .attach('psf_file', psfFilePath)
      .attach('dat_file', datFilePath)
      .attach('inp_file', inpFilePath)
    expectSuccessfulJobResponse(res, 'New crd_psf Job successfully created')
  })
  test('should inform us that BilboMD alphafold is unavailable on this deployment', async () => {
    const apiToken = generateApiToken()

    const datFilePath = path.resolve(__dirname, '../test/data/af-mono/A_S_USP16-FL_1.dat')
    const entitiesJsonPath = path.resolve(__dirname, '../test/data/af-mono/entities.json')

    const res = await request(server)
      .post('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')
      .field('bilbomd_mode', 'alphafold')
      .field('title', 'API Test Job CRD')
      .attach('dat_file', datFilePath)
      .attach('entities_json', entitiesJsonPath)

    console.log('RESPONSE STATUS:', res.status)
    console.log('Response:', res.body)

    expect(res.status).toBe(403)
    expect(res.body.message).toBe('AlphaFold jobs unavailable on this deployment.')
  })
  test('should submit a BilboMD alphafold job successfully', async () => {
    const originalUseNersc = process.env.USE_NERSC
    process.env.USE_NERSC = 'true'
    const apiToken = generateApiToken()

    const datFilePath = path.resolve(__dirname, '../test/data/af-mono/A_S_USP16-FL_1.dat')
    const entitiesJsonPath = path.resolve(__dirname, '../test/data/af-mono/entities.json')

    const res = await request(server)
      .post('/api/v1/external/jobs')
      .set('Authorization', `Bearer ${apiToken}`)
      .set('Accept', 'application/json')
      .field('bilbomd_mode', 'alphafold')
      .field('title', 'API Test Job CRD')
      .attach('dat_file', datFilePath)
      .attach('entities_json', entitiesJsonPath)
    expectSuccessfulJobResponse(
      res,
      'New alphafold Job API Test Job CRD successfully created'
    )
    process.env.USE_NERSC = originalUseNersc
  })
})
