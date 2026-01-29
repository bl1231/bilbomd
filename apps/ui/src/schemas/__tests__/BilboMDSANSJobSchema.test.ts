import { describe, it, expect, vi } from 'vitest'
import { BilboMDSANSJobSchema } from '../BilboMDSANSJobSchema'
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

describe('BilboMDSANSJobSchema', () => {
  it('md_engine allows charmm and openmm', async () => {
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
    await expect(
      BilboMDSANSJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})
