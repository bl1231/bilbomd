import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runStripIons, runStripCofactors, runCifToPdb } from '../pdb-to-crd.js'
import { logger } from '../../../helpers/loggers.js'
import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('fs-extra', () => ({
  default: {
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn((cb?: () => void) => cb?.())
    }))
  }
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

// ---------------------------------------------------------------------------
// Helper: build a fake child process that emits close with a given exit code
// ---------------------------------------------------------------------------
const makeProc = (exitCode: number) => {
  const proc = new EventEmitter() as ReturnType<typeof spawn>
  // @ts-expect-error — minimal fake streams
  proc.stdout = new EventEmitter()
  // @ts-expect-error
  proc.stderr = new EventEmitter()
  setTimeout(() => proc.emit('close', exitCode), 0)
  return proc
}

describe('pdb-to-crd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: spawn returns a process that exits cleanly
    vi.mocked(spawn).mockReturnValue(makeProc(0) as ReturnType<typeof spawn>)
  })

  // -------------------------------------------------------------------------
  // runStripIons
  // -------------------------------------------------------------------------
  describe('runStripIons', () => {
    it('resolves when strip_ions.py exits 0', async () => {
      await expect(
        runStripIons({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      ).resolves.toBeUndefined()
    })

    it('spawns the correct script path', async () => {
      await runStripIons({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        '/opt/envs/base/bin/python',
        expect.arrayContaining(['/app/scripts/strip_ions.py']),
        expect.any(Object)
      )
    })

    it('rejects when strip_ions.py exits non-zero', async () => {
      vi.mocked(spawn).mockReturnValueOnce(makeProc(1) as ReturnType<typeof spawn>)
      await expect(
        runStripIons({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      ).rejects.toThrow('strip_ions.py exited with code 1')
    })

    it('logs info on success', async () => {
      await runStripIons({ uuid: 'abc', pdb_file: 'x.pdb' })
      expect(vi.mocked(logger).info).toHaveBeenCalledWith(
        expect.stringContaining('runStripIons')
      )
    })
  })

  // -------------------------------------------------------------------------
  // runStripCofactors
  // -------------------------------------------------------------------------
  describe('runStripCofactors', () => {
    it('resolves when strip_cofactors.py exits 0', async () => {
      await expect(
        runStripCofactors({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      ).resolves.toBeUndefined()
    })

    it('spawns the correct script path', async () => {
      await runStripCofactors({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(
        '/opt/envs/base/bin/python',
        expect.arrayContaining(['/app/scripts/strip_cofactors.py']),
        expect.any(Object)
      )
    })

    it('rejects when strip_cofactors.py exits non-zero', async () => {
      vi.mocked(spawn).mockReturnValueOnce(makeProc(1) as ReturnType<typeof spawn>)
      await expect(
        runStripCofactors({ uuid: 'test-uuid', pdb_file: 'input.pdb' })
      ).rejects.toThrow('strip_cofactors.py exited with code 1')
    })

    it('logs info on success', async () => {
      await runStripCofactors({ uuid: 'abc', pdb_file: 'x.pdb' })
      expect(vi.mocked(logger).info).toHaveBeenCalledWith(
        expect.stringContaining('runStripCofactors')
      )
    })

    it('logs error on stderr output', async () => {
      const proc = makeProc(0)
      vi.mocked(spawn).mockReturnValueOnce(proc as ReturnType<typeof spawn>)
      const promise = runStripCofactors({ uuid: 'abc', pdb_file: 'x.pdb' })
      // @ts-expect-error — fake stream
      proc.stderr.emit('data', Buffer.from('some warning'))
      await promise
      expect(vi.mocked(logger).error).toHaveBeenCalledWith(
        expect.stringContaining('some warning')
      )
    })
  })

  // -------------------------------------------------------------------------
  // runCifToPdb
  // -------------------------------------------------------------------------
  describe('runCifToPdb', () => {
    it('resolves with the output PDB filename', async () => {
      const result = await runCifToPdb({ uuid: 'u1', pdb_file: 'structure.cif' })
      expect(result).toBe('structure.pdb')
    })

    it('rejects when cif_to_pdb.py exits non-zero', async () => {
      vi.mocked(spawn).mockReturnValueOnce(makeProc(1) as ReturnType<typeof spawn>)
      await expect(
        runCifToPdb({ uuid: 'u1', pdb_file: 'structure.cif' })
      ).rejects.toThrow('cif_to_pdb.py exited with code 1')
    })
  })
})
