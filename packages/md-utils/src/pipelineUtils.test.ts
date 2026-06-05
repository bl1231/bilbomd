import { describe, it, expect } from 'vitest'
import { toPipeline, discriminatorToPipeline } from './pipelineUtils'

describe('pipelineUtils', () => {
  describe('toPipeline', () => {
    it('should handle special case mappings', () => {
      expect(toPipeline('crd_psf')).toBe('crd')
    })

    it('should handle mongoose discriminator format', () => {
      expect(toPipeline('BilboMdPdb')).toBe('pdb')
      expect(toPipeline('BilboMdCrd')).toBe('crd')
      expect(toPipeline('BilboMdAuto')).toBe('auto')
      expect(toPipeline('BilboMdAlphafold')).toBe('alphafold')
      expect(toPipeline('BilboMdOpenfold')).toBe('openfold')
      expect(toPipeline('BilboMdSans')).toBe('sans')
      expect(toPipeline('BilboMdScoper')).toBe('scoper')
      expect(toPipeline('BilboMdMulti')).toBe('multi')
    })

    it('should handle case-insensitive input', () => {
      expect(toPipeline('PDB')).toBe('pdb')
      expect(toPipeline('Auto')).toBe('auto')
      expect(toPipeline('ALPHAFOLD')).toBe('alphafold')
    })

    it('should handle direct pipeline types', () => {
      expect(toPipeline('pdb')).toBe('pdb')
      expect(toPipeline('crd')).toBe('crd')
      expect(toPipeline('auto')).toBe('auto')
      expect(toPipeline('alphafold')).toBe('alphafold')
      expect(toPipeline('openfold')).toBe('openfold')
      expect(toPipeline('sans')).toBe('sans')
      expect(toPipeline('scoper')).toBe('scoper')
      expect(toPipeline('multi')).toBe('multi')
    })

    it('should throw error for invalid pipeline modes', () => {
      expect(() => toPipeline('invalid')).toThrow(
        'Invalid pipeline mode: invalid'
      )
      expect(() => toPipeline('')).toThrow('Invalid pipeline mode: ')
      expect(() => toPipeline('BilboMdInvalid')).toThrow(
        'Invalid pipeline mode: BilboMdInvalid'
      )
    })

    it('should throw error for non-string input', () => {
      expect(() => toPipeline(null as unknown as string)).toThrow(
        'Invalid pipeline mode: null'
      )
      expect(() => toPipeline(undefined as unknown as string)).toThrow(
        'Invalid pipeline mode: undefined'
      )
      expect(() => toPipeline(123 as unknown as string)).toThrow(
        'Invalid pipeline mode: 123'
      )
    })
  })

  describe('discriminatorToPipeline', () => {
    it('should handle mongoose discriminators', () => {
      expect(discriminatorToPipeline('BilboMdPdb')).toBe('pdb')
      expect(discriminatorToPipeline('BilboMdCrd')).toBe('crd')
      expect(discriminatorToPipeline('BilboMdAuto')).toBe('auto')
    })

    it('should return auto for empty or undefined input', () => {
      expect(discriminatorToPipeline()).toBe('auto')
      expect(discriminatorToPipeline('')).toBe('auto')
      expect(discriminatorToPipeline(null as unknown as string)).toBe('auto')
    })

    it('should return auto for invalid discriminators', () => {
      expect(discriminatorToPipeline('InvalidDiscriminator')).toBe('auto')
      expect(discriminatorToPipeline('BilboMdInvalid')).toBe('auto')
    })
  })
})
