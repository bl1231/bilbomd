import { describe, it, expect, vi } from 'vitest'
import type { Request } from 'express'
import { setServerFile, serverFile, isPlainFileName } from '../serverFiles.js'

vi.mock('../jobUtils.js', () => ({
  getFileStats: vi.fn(() => ({ size: 42 }))
}))

const makeReq = (body: Record<string, unknown> = {}) =>
  ({ body }) as unknown as Request

describe('serverFiles', () => {
  it('returns the file the server registered, inside the job directory', () => {
    const req = makeReq()
    setServerFile(req, 'pdb_file', 'example.pdb')

    expect(serverFile(req, '/data/job-1', 'pdb_file')).toEqual({
      originalname: 'example.pdb',
      path: '/data/job-1/example.pdb',
      size: 42
    })
  })

  it('returns undefined when nothing was registered for the field', () => {
    const req = makeReq()
    setServerFile(req, 'pdb_file', 'example.pdb')

    expect(serverFile(req, '/data/job-1', 'dat_file')).toBeUndefined()
  })

  it('never reads file names from the request body', () => {
    const req = makeReq({ dat_file: 'saxs.dat', pdb_file: '../x/y.pdb' })

    expect(serverFile(req, '/data/job-1', 'dat_file')).toBeUndefined()
    expect(serverFile(req, '/data/job-1', 'pdb_file')).toBeUndefined()
  })

  it('keeps registrations separate per request', () => {
    const a = makeReq()
    const b = makeReq()
    setServerFile(a, 'dat_file', 'a.dat')

    expect(serverFile(b, '/data/job-1', 'dat_file')).toBeUndefined()
  })

  it.each([
    '../evil.inp',
    'sub/dir.inp',
    '/etc/passwd',
    '..',
    '.',
    '',
    'a\\b.dat'
  ])('refuses to register %j', (name) => {
    expect(isPlainFileName(name)).toBe(false)
    expect(() => setServerFile(makeReq(), 'inp_file', name)).toThrow()
  })

  it.each(['const.inp', 'example-saxs.dat', 'my_model.v2.pdb'])(
    'accepts %j',
    (name) => {
      expect(isPlainFileName(name)).toBe(true)
    }
  )
})
