import { describe, it, expect, vi } from 'vitest'
import { BilboMDClassicJobSchema } from '../BilboMDClassicJobSchema'
// Mock heavy validators to simplify unit tests
vi.mock('../ValidationFunctions', () => ({
  noSpaces: () => true,
  isSaxsData: async () => ({ valid: true }),
  isValidConstInpFile: async () => true,
  hasAllowedResiduesOnly: async () => ({ valid: true, unsupportedResidues: [] }),
  isPsfData: async () => true,
  isCRD: async () => true,
  containsChainId: async () => true,
  noLeadingSpaceOnPDBLines: async () => true
}))

// No heavy file validation in these tests

describe('BilboMDClassicJobSchema', () => {
  it('md_engine allows charmm and openmm', async () => {
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
    await expect(
      BilboMDClassicJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})
