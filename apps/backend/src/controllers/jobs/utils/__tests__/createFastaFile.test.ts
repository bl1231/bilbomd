import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

const mockWriteFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('fs-extra', () => ({
  default: { writeFile: mockWriteFile },
  writeFile: mockWriteFile
}))

vi.mock('../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { createFastaFile } from '../createFastaFile.js'

describe('createFastaFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses >single-chain header for a single entity with 1 copy', async () => {
    await createFastaFile(
      [{ name: 'A', sequence: 'MAAV', type: 'protein', copies: 1 }],
      '/tmp/job'
    )
    const [, content] = mockWriteFile.mock.calls[0]
    expect(content).toMatch(/^>single-chain/)
  })

  it('uses >multimer header for a single entity with multiple copies', async () => {
    await createFastaFile(
      [{ name: 'A', sequence: 'MAAV', type: 'protein', copies: 3 }],
      '/tmp/job'
    )
    const [, content] = mockWriteFile.mock.calls[0]
    expect(content).toMatch(/^>multimer/)
  })

  it('uses >complex header for multiple entities', async () => {
    await createFastaFile(
      [
        { name: 'A', sequence: 'MAAV', type: 'protein', copies: 1 },
        { name: 'B', sequence: 'GCGC', type: 'dna', copies: 1 }
      ],
      '/tmp/job'
    )
    const [, content] = mockWriteFile.mock.calls[0]
    expect(content).toMatch(/^>complex/)
  })

  it('writes to the default filename af-entities.fasta', async () => {
    await createFastaFile(
      [{ name: 'A', sequence: 'MAAV', type: 'protein', copies: 1 }],
      '/tmp/job'
    )
    const [filePath] = mockWriteFile.mock.calls[0]
    expect(filePath).toBe(path.join('/tmp/job', 'af-entities.fasta'))
  })

  it('uses the custom filename when provided', async () => {
    await createFastaFile(
      [{ name: 'A', sequence: 'MAAV', type: 'protein', copies: 1 }],
      '/tmp/job',
      'custom.fasta'
    )
    const [filePath] = mockWriteFile.mock.calls[0]
    expect(filePath).toBe(path.join('/tmp/job', 'custom.fasta'))
  })

  it('repeats the sequence for each copy, separated by colons (last has no colon)', async () => {
    await createFastaFile(
      [{ name: 'A', sequence: 'MAAV', type: 'protein', copies: 3 }],
      '/tmp/job'
    )
    const [, content] = mockWriteFile.mock.calls[0]
    const lines = content.split('\n')
    // Header on line 0, sequence lines follow
    expect(lines[1]).toBe('MAAV:')
    expect(lines[2]).toBe('MAAV:')
    expect(lines[3]).toBe('MAAV')
  })

  it('joins sequences of multiple entities with colons, last has no colon', async () => {
    await createFastaFile(
      [
        { name: 'A', sequence: 'AAAA', type: 'protein', copies: 1 },
        { name: 'B', sequence: 'BBBB', type: 'protein', copies: 1 }
      ],
      '/tmp/job'
    )
    const [, content] = mockWriteFile.mock.calls[0]
    const lines = content.split('\n')
    expect(lines[1]).toBe('AAAA:')
    expect(lines[2]).toBe('BBBB')
  })
})
