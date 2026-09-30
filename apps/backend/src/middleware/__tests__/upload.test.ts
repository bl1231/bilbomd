import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express, { Request, Response } from 'express'
import request from 'supertest'
import multer from 'multer'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  createUpload,
  getUploadErrorResponse,
  MAX_UPLOAD_FILE_SIZE
} from '../upload.js'

const buildApp = (
  destination: string,
  opts: Omit<Parameters<typeof createUpload>[0], 'destination'> = {}
) => {
  const app = express()
  app.post('/upload', (req: Request, res: Response) => {
    const upload = createUpload({ destination, ...opts })
    upload.fields([
      { name: 'pdb_file', maxCount: 1 },
      { name: 'dat_file', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        const { status, message } = getUploadErrorResponse(err)
        res.status(status).json({ message })
        return
      }
      res.status(200).json({ body: req.body })
    })
  })
  return app
}

describe('createUpload', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-test-'))
  })

  afterEach(async () => {
    await fs.remove(dir)
  })

  it('stores files under the lowercased original name by default', async () => {
    const res = await request(buildApp(dir))
      .post('/upload')
      .attach('pdb_file', Buffer.from('ATOM'), 'MyModel.PDB')

    expect(res.status).toBe(200)
    expect(await fs.pathExists(path.join(dir, 'mymodel.pdb'))).toBe(true)
  })

  it.each(['../Escape.PDB', '..\\..\\Escape.PDB', '/tmp/Escape.PDB'])(
    'keeps an upload named %j inside the destination',
    async (filepath) => {
      const res = await request(buildApp(dir))
        .post('/upload')
        // `filepath` (unlike `filename`) is sent as-is, directories included;
        // form-data supports it but superagent's types don't declare it
        .attach('pdb_file', Buffer.from('ATOM'), {
          filepath
        } as unknown as { filename: string })

      expect(res.status).toBe(200)
      expect(await fs.readdir(dir)).toEqual(['escape.pdb'])
      expect(await fs.pathExists(path.join(dir, '..', 'escape.pdb'))).toBe(
        false
      )
    }
  )

  it('uses a custom filename function when provided', async () => {
    const res = await request(buildApp(dir, { filename: () => 'expdata.dat' }))
      .post('/upload')
      .attach('dat_file', Buffer.from('0.01 1.0 0.1'), 'whatever.dat')

    expect(res.status).toBe(200)
    expect(await fs.pathExists(path.join(dir, 'expdata.dat'))).toBe(true)
  })

  it('rejects files over maxFileSize with 413 and leaves no partial file', async () => {
    const res = await request(buildApp(dir, { maxFileSize: 1024 }))
      .post('/upload')
      .attach('dat_file', Buffer.alloc(4096, 'a'), 'big.dat')

    expect(res.status).toBe(413)
    expect(res.body.message).toBe(
      'File dat_file exceeds the maximum upload size'
    )
    expect(await fs.readdir(dir)).toEqual([])
  })

  it('rejects unexpected file fields with 400', async () => {
    const res = await request(buildApp(dir))
      .post('/upload')
      .attach('evil_file', Buffer.from('x'), 'evil.txt')

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/^File upload error/)
  })

  it('still parses ordinary text fields', async () => {
    const res = await request(buildApp(dir))
      .post('/upload')
      .field('bilbomd_mode', 'pdb')

    expect(res.status).toBe(200)
    expect(res.body.body).toEqual({ bilbomd_mode: 'pdb' })
  })
})

describe('getUploadErrorResponse', () => {
  it('maps LIMIT_FILE_SIZE to 413', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE', 'pae_file')
    expect(getUploadErrorResponse(err)).toEqual({
      status: 413,
      message: 'File pae_file exceeds the maximum upload size'
    })
  })

  it('omits the field name when multer does not supply one', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE')
    expect(getUploadErrorResponse(err).message).toBe(
      'File exceeds the maximum upload size'
    )
  })

  it('maps other multer errors to 400', () => {
    const err = new multer.MulterError('LIMIT_FILE_COUNT')
    expect(getUploadErrorResponse(err).status).toBe(400)
  })

  it('maps non-multer errors to 500', () => {
    expect(getUploadErrorResponse(new Error('disk full'))).toEqual({
      status: 500,
      message: 'Failed to upload one or more files'
    })
  })

  it('keeps the global ceiling large enough for AlphaFold PAE files', () => {
    expect(MAX_UPLOAD_FILE_SIZE).toBeGreaterThanOrEqual(120_000_000)
  })
})
