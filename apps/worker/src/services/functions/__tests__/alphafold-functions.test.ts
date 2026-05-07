import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
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

vi.mock('fs-extra', () => {
  const files = new Map<string, Buffer | string>()
  const dirEntries = new Map<string, string[]>()
  return {
    default: {
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
    colabfoldServiceUrl: 'http://colabfold-service:8000',
    colabfoldTimeoutMs: 60_000
  }
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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
        'job_scores_rank_002_alphafold2_ptm_model_2_seed_000.json'
      )
    ).toBe(false)
  })
})

describe('runAlphaFold integration shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' })
  })

  it('throws when the FASTA file is missing', async () => {
    const fs = (await import('fs-extra')).default as unknown as {
      __setFiles: (m: Record<string, string>) => void
      __setDirs: (m: Record<string, string[]>) => void
    }
    fs.__setFiles({})
    fs.__setDirs({})

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

  it('calls ColabFold service and promotes rank_001 outputs on success', async () => {
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
    expect(mockFetch).toHaveBeenCalledWith(
      'http://colabfold-service:8000/infer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ uuid: 'abc' })
      })
    )
  })

  it('throws when the ColabFold service returns an error', async () => {
    const fs = (await import('fs-extra')).default as unknown as {
      __setFiles: (m: Record<string, string>) => void
      __setDirs: (m: Record<string, string[]>) => void
    }
    fs.__setFiles({ '/in/uploads/abc/af-entities.fasta': '>a\nACDE' })
    fs.__setDirs({})
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'GPU OOM'
    })

    const { runAlphaFold } = await import('../alphafold-functions.js')
    const fakeJob = {
      uuid: 'abc',
      pdb_file: undefined,
      pae_file: undefined,
      save: vi.fn()
    } as never
    const fakeMQ = { log: vi.fn() } as never

    await expect(runAlphaFold(fakeMQ, fakeJob)).rejects.toThrow(
      /ColabFold service returned HTTP 500/
    )
  })
})
