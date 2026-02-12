import { describe, it, expect } from 'vitest'
import { displayPropertiesByJobType } from '../JobDBDisplayProperties'

describe('displayPropertiesByJobType', () => {
  it('should define display properties for all job types', () => {
    const expectedJobTypes = [
      'BilboMdPDB',
      'BilboMdCRD',
      'BilboMdAuto',
      'BilboMdScoper',
      'BilboMdAlphaFold',
      'BilboMdSANS'
    ]

    expectedJobTypes.forEach((jobType) => {
      expect(displayPropertiesByJobType).toHaveProperty(jobType)
    })
  })

  describe('BilboMdPDB', () => {
    it('should include all expected display properties', () => {
      const expected = [
        'PDB file',
        'PSF file',
        'CRD file',
        'CHARMM constraint file',
        'Rg min',
        'Rg max',
        'Rg step size',
        'Rg List',
        'Number of conformations'
      ]

      expect(displayPropertiesByJobType.BilboMdPDB).toEqual(expected)
    })

    it('should have 9 properties', () => {
      expect(displayPropertiesByJobType.BilboMdPDB).toHaveLength(9)
    })
  })

  describe('BilboMdCRD', () => {
    it('should not include PDB file', () => {
      expect(displayPropertiesByJobType.BilboMdCRD).not.toContain('PDB file')
    })

    it('should include PSF and CRD files', () => {
      expect(displayPropertiesByJobType.BilboMdCRD).toContain('PSF file')
      expect(displayPropertiesByJobType.BilboMdCRD).toContain('CRD file')
    })

    it('should have 8 properties', () => {
      expect(displayPropertiesByJobType.BilboMdCRD).toHaveLength(8)
    })
  })

  describe('BilboMdAuto', () => {
    it('should have same properties as BilboMdPDB', () => {
      expect(displayPropertiesByJobType.BilboMdAuto).toEqual(
        displayPropertiesByJobType.BilboMdPDB
      )
    })
  })

  describe('BilboMdScoper', () => {
    it('should only include PSF, CRD, and PDB files', () => {
      const expected = ['PSF file', 'CRD file', 'PDB file']
      expect(displayPropertiesByJobType.BilboMdScoper).toEqual(expected)
    })

    it('should have 3 properties', () => {
      expect(displayPropertiesByJobType.BilboMdScoper).toHaveLength(3)
    })
  })

  describe('BilboMdAlphaFold', () => {
    it('should have empty properties array', () => {
      expect(displayPropertiesByJobType.BilboMdAlphaFold).toEqual([])
    })

    it('should have 0 properties', () => {
      expect(displayPropertiesByJobType.BilboMdAlphaFold).toHaveLength(0)
    })
  })

  describe('BilboMdSANS', () => {
    it('should include SANS-specific properties', () => {
      expect(displayPropertiesByJobType.BilboMdSANS).toContain(
        'Solvent D20 Fraction'
      )
    })

    it('should include standard Rg properties', () => {
      expect(displayPropertiesByJobType.BilboMdSANS).toContain('Rg min')
      expect(displayPropertiesByJobType.BilboMdSANS).toContain('Rg max')
      expect(displayPropertiesByJobType.BilboMdSANS).toContain('Rg step size')
    })

    it('should have 7 properties', () => {
      expect(displayPropertiesByJobType.BilboMdSANS).toHaveLength(7)
    })
  })

  describe('property consistency', () => {
    it('should have Rg properties in PDB, CRD, Auto, and SANS jobs', () => {
      const jobTypesWithRg = [
        'BilboMdPDB',
        'BilboMdCRD',
        'BilboMdAuto',
        'BilboMdSANS'
      ]

      jobTypesWithRg.forEach((jobType) => {
        expect(displayPropertiesByJobType[jobType]).toContain('Rg min')
        expect(displayPropertiesByJobType[jobType]).toContain('Rg max')
      })
    })

    it('should have constraint file in PDB, CRD, and Auto jobs', () => {
      const jobTypesWithConstraint = ['BilboMdPDB', 'BilboMdCRD', 'BilboMdAuto']

      jobTypesWithConstraint.forEach((jobType) => {
        expect(displayPropertiesByJobType[jobType]).toContain(
          'CHARMM constraint file'
        )
      })
    })
  })
})
