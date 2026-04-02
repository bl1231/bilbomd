import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getKGSrnaProgress } from '../functions/getKGSrnaProgress.js'

vi.mock('fs-extra', () => ({
  default: { readdir: vi.fn() }
}))

import fs from 'fs-extra'

beforeEach(() => vi.clearAllMocks())

describe('getKGSrnaProgress', () => {
  it('returns the highest pdb number found in the directory', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      'newpdb_1.pdb',
      'newpdb_5.pdb',
      'newpdb_3.pdb',
      'other_file.txt'
    ] as never)
    expect(await getKGSrnaProgress('/some/dir')).toBe(5)
  })

  it('returns 0 when no matching pdb files exist', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['README.md', 'output.txt'] as never)
    expect(await getKGSrnaProgress('/some/dir')).toBe(0)
  })

  it('returns 0 when directory is empty', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as never)
    expect(await getKGSrnaProgress('/some/dir')).toBe(0)
  })

  it('handles single pdb file correctly', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['newpdb_42.pdb'] as never)
    expect(await getKGSrnaProgress('/some/dir')).toBe(42)
  })

  it('ignores files that start with newpdb_ but do not end with .pdb', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['newpdb_10.txt', 'newpdb_5.pdb'] as never)
    expect(await getKGSrnaProgress('/some/dir')).toBe(5)
  })

  it('throws when readdir fails', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT: no such file'))
    await expect(getKGSrnaProgress('/nonexistent')).rejects.toThrow('ENOENT')
  })
})
