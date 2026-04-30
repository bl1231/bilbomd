import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import {
  buildDockerArgs,
  RANK1_PAE_PATTERN,
  RANK1_PDB_PATTERN
} from '../alphafold-functions.js'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

vi.mock('fs-extra', () => {
  const files = new Map<string, Buffer | string>()
  const dirEntries = new Map<string, string[]>()
  return {
    default: {
      createWriteStream: vi.fn(() => ({
        write: vi.fn(),
        end: vi.fn((cb?: () => void) => cb?.())
      })),
      pathExists: vi.fn(async (p: string) => files.has(p) || dirEntries.has(p)),
      readdir: vi.fn(async (dir: string) => dirEntries.get(dir) ?? []),
      copy: vi.fn(async (src: string, dst: string) => {
        files.set(dst, files.get(src) ?? 'copied')
      }),
      stat: vi.fn(async (p: string) => ({
        size: (files.get(p)?.toString().length ?? 0) || 1
      })),
      __setFiles: (next: Record<string, Buffer | string>) => {
        files.clear()
        for (const [k, v] of Object.entries(next)) files.set(k, v)
      },
      __setDirs: (next: Record<string, string[]>) => {
        dirEntries.clear()
        for (const [k, v] of Object.entries(next)) dirEntries.set(k, v)
      }
    }
  }
})

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(async () => undefined)
}))

vi.mock('../job-utils.js', () => ({
  handleError: vi.fn(async () => undefined)
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    uploadDir: '/in/uploads',
    hostUploadDir: '/host/uploads',
    hostColabfoldCache: '/host/cache',
    colabfoldImage: 'ghcr.io/test/colabfold:latest',
    colabfoldTimeoutMs: 60_000,
    dockerBin: '/usr/bin/docker'
  }
}))

const makeProc = (exitCode: number) => {
  const proc = new EventEmitter() as unknown as ReturnType<typeof spawn>
  // @ts-expect-error minimal stub
  proc.stdout = new EventEmitter()
  // @ts-expect-error minimal stub
  proc.stderr = new EventEmitter()
  // @ts-expect-error minimal stub
  proc.kill = vi.fn()
  setTimeout(() => proc.emit('close', exitCode), 0)
  return proc
}

describe('buildDockerArgs', () => {
  it('produces the expected docker run argv', () => {
    const args = buildDockerArgs({
      hostJobDir: '/host/uploads/abc',
      hostCacheDir: '/host/cache',
      gpus: 'device=1',
      image: 'ghcr.io/test/colabfold:latest'
    })
    expect(args).toEqual([
      'run',
      '--rm',
      '--gpus',
      'device=1',
      '-v',
      '/host/uploads/abc:/bilbomd/work',
      '-v',
      '/host/cache:/cache',
      '-e',
      'COLABFOLD_DATA_DIR=/cache',
      'ghcr.io/test/colabfold:latest',
      'colabfold_batch',
      '--num-models=3',
      '--amber',
      '--use-gpu-relax',
      '--num-recycle=4',
      'af-entities.fasta',
      'alphafold'
    ])
  })
})

describe('rank_001 patterns', () => {
  it('matches relaxed rank_001 PDB names', () => {
    expect(
      RANK1_PDB_PATTERN.test(
        'job_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.pdb'
      )
    ).toBe(false)
    expect(
      RANK1_PDB_PATTERN.test(
        'job_relaxed_rank_001_alphafold2_ptm_model_3_seed_000.pdb'
      )
    ).toBe(true)
  })

  it('matches rank_001 PAE scores JSON names', () => {
    expect(
      RANK1_PAE_PATTERN.test(
        'job_scores_rank_001_alphafold2_ptm_model_3_seed_000.json'
      )
    ).toBe(true)
    expect(
      RANK1_PAE_PATTERN.test(
        'job_scores_rank_002_alphafold2_ptm_model_3_seed_000.json'
      )
    ).toBe(false)
  })
})

describe('runAlphaFold integration shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when the FASTA file is missing', async () => {
    const fs = (await import('fs-extra')).default as unknown as {
      __setFiles: (m: Record<string, string>) => void
      __setDirs: (m: Record<string, string[]>) => void
    }
    fs.__setFiles({})
    fs.__setDirs({})
    vi.mocked(spawn).mockReturnValue(
      makeProc(0) as unknown as ReturnType<typeof spawn>
    )

    const { runAlphaFold } = await import('../alphafold-functions.js')
    const fakeJob = {
      uuid: 'abc',
      pdb_file: undefined,
      pae_file: undefined,
      save: vi.fn(async () => undefined)
    } as never

    const fakeMQ = { log: vi.fn() } as never

    await expect(runAlphaFold(fakeMQ, fakeJob)).rejects.toThrow(
      /AlphaFold input FASTA missing/
    )
  })

  it('promotes rank_001 outputs and persists pdb_file/pae_file on success', async () => {
    const fs = (await import('fs-extra')).default as unknown as {
      __setFiles: (m: Record<string, string>) => void
      __setDirs: (m: Record<string, string[]>) => void
    }
    fs.__setFiles({
      '/in/uploads/abc/af-entities.fasta': '>a\nACDE'
    })
    fs.__setDirs({
      '/in/uploads/abc/alphafold': [
        'job_relaxed_rank_001_alphafold2_ptm_model_3_seed_000.pdb',
        'job_scores_rank_001_alphafold2_ptm_model_3_seed_000.json',
        'job_relaxed_rank_002_alphafold2_ptm_model_2_seed_000.pdb'
      ]
    })
    vi.mocked(spawn).mockReturnValue(
      makeProc(0) as unknown as ReturnType<typeof spawn>
    )

    const { runAlphaFold } = await import('../alphafold-functions.js')
    const save = vi.fn(async () => undefined)
    const fakeJob = {
      uuid: 'abc',
      pdb_file: undefined,
      pae_file: undefined,
      save
    } as never
    const fakeMQ = { log: vi.fn() } as never

    await runAlphaFold(fakeMQ, fakeJob)

    expect(fakeJob).toMatchObject({
      pdb_file: 'af-rank1.pdb',
      pae_file: 'af-pae.json'
    })
    expect(save).toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/docker',
      expect.arrayContaining([
        'run',
        '--rm',
        '--gpus',
        expect.stringMatching(/^device=|^all$/),
        '-v',
        '/host/uploads/abc:/bilbomd/work'
      ]),
      expect.objectContaining({ cwd: '/in/uploads/abc' })
    )
  })
})
