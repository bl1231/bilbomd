import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs-extra', () => ({
  default: { writeJson: vi.fn().mockResolvedValue(undefined) }
}))

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs-extra'
import { createOpenFoldQueryJson } from '../createOpenFoldQueryJson.js'

const mockWriteJson = vi.mocked(fs.writeJson)

describe('createOpenFoldQueryJson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a query JSON with a single protein entity', async () => {
    await createOpenFoldQueryJson(
      [{ name: 'chainA', sequence: 'MAAV', type: 'Protein', copies: 1 }],
      '/job/dir'
    )

    expect(mockWriteJson).toHaveBeenCalledOnce()
    const [, json] = mockWriteJson.mock.calls[0]
    const query = json.queries['openfold-query']
    expect(query.chains).toHaveLength(1)
    expect(query.chains[0].molecule_type).toBe('protein')
    expect(query.chains[0].chain_ids).toEqual(['A'])
    expect(query.chains[0].sequence).toBe('MAAV')
  })

  it('assigns sequential chain IDs for multiple copies', async () => {
    await createOpenFoldQueryJson(
      [{ name: 'chainA', sequence: 'MAAV', type: 'Protein', copies: 3 }],
      '/job/dir'
    )

    const [, json] = mockWriteJson.mock.calls[0]
    expect(json.queries['openfold-query'].chains[0].chain_ids).toEqual([
      'A',
      'B',
      'C'
    ])
  })

  it('assigns chain IDs across multiple entities', async () => {
    await createOpenFoldQueryJson(
      [
        { name: 'p', sequence: 'MAAV', type: 'Protein', copies: 2 },
        { name: 'd', sequence: 'ATCG', type: 'DNA', copies: 1 }
      ],
      '/job/dir'
    )

    const [, json] = mockWriteJson.mock.calls[0]
    const chains = json.queries['openfold-query'].chains
    expect(chains[0].chain_ids).toEqual(['A', 'B'])
    expect(chains[1].chain_ids).toEqual(['C'])
  })

  it('maps molecule types correctly', async () => {
    await createOpenFoldQueryJson(
      [
        { name: 'p', sequence: 'MAAV', type: 'Protein', copies: 1 },
        { name: 'd', sequence: 'ATCG', type: 'DNA', copies: 1 },
        { name: 'r', sequence: 'AUGC', type: 'RNA', copies: 1 }
      ],
      '/job/dir'
    )

    const [, json] = mockWriteJson.mock.calls[0]
    const types = json.queries['openfold-query'].chains.map(
      (c: { molecule_type: string }) => c.molecule_type
    )
    expect(types).toEqual(['protein', 'dna', 'rna'])
  })

  it('uses a custom query name when provided', async () => {
    await createOpenFoldQueryJson(
      [{ name: 'chainA', sequence: 'MAAV', type: 'Protein', copies: 1 }],
      '/job/dir',
      'my-query'
    )

    const [, json] = mockWriteJson.mock.calls[0]
    expect(json.queries['my-query']).toBeDefined()
    expect(json.queries['openfold-query']).toBeUndefined()
  })

  it('writes to the correct file path', async () => {
    await createOpenFoldQueryJson(
      [{ name: 'chainA', sequence: 'MAAV', type: 'Protein', copies: 1 }],
      '/job/dir',
      'openfold-query',
      'custom.json'
    )

    const [filePath] = mockWriteJson.mock.calls[0]
    expect(filePath).toBe('/job/dir/custom.json')
  })

  it('falls back to protein for unknown molecule type', async () => {
    await createOpenFoldQueryJson(
      [
        {
          name: 'x',
          sequence: 'MAAV',
          type: 'Unknown' as 'Protein',
          copies: 1
        }
      ],
      '/job/dir'
    )

    const [, json] = mockWriteJson.mock.calls[0]
    expect(json.queries['openfold-query'].chains[0].molecule_type).toBe(
      'protein'
    )
  })
})
