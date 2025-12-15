import { describe, it, expect, vi } from 'vitest'
import { BilboMDAutoJobSchema } from '../BilboMDAutoJobSchema'
// Mock heavy validators to simplify unit tests
vi.mock('../ValidationFunctions', () => ({
  noSpaces: () => true,
  isSaxsData: async () => ({ valid: true }),
  isValidConstInpFile: async () => true,
  hasAllowedResiduesOnly: async () => ({
    valid: true,
    unsupportedResidues: []
  }),
  isPsfData: async () => true,
  isCRD: async () => true,
  containsChainId: async () => true,
  noLeadingSpaceOnPDBLines: async () => true
}))

// Use string filenames to bypass heavy content validators
// const makeFile = (name: string) => name

describe('BilboMDAutoJobSchema', () => {
  it('md_engine allows charmm and openmm', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})
