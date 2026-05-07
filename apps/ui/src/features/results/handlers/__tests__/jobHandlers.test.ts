import {
  createAutoJobHandler,
  createSansJobHandler,
  createPdbJobHandler,
  createCrdJobHandler,
  createScoperJobHandler,
  createAlphaFoldJobHandler,
  createMultiJobHandler,
  createOpenFoldJobHandler
} from '../jobHandlers'
import type {
  BilboMDJobDTO,
  BilboMDAutoDTO,
  BilboMDSANSDTO
} from '@bilbomd/bilbomd-types'

// Mock job data generators
const createMockJob = <T extends BilboMDJobDTO['mongo']>(
  overrides: Partial<T> = {} as Partial<T>
): BilboMDJobDTO => ({
  id: 'test-job-1',
  username: 'testuser',
  mongo: {
    id: 'mongo-id-1',
    jobType: 'auto',
    title: 'Test Job',
    uuid: 'test-uuid',
    access_mode: 'user',
    status: 'Completed',
    data_file: 'test.dat',
    md_engine: 'CHARMM',
    time_submitted: new Date('2023-01-01'),
    ...overrides
  } as T
})

const createMockAutoJob = (
  overrides: Partial<BilboMDAutoDTO> = {}
): BilboMDJobDTO => ({
  ...createMockJob(),
  mongo: {
    ...createMockJob().mongo,
    jobType: 'auto',
    pdb_file: 'test.pdb',
    psf_file: 'test.psf',
    crd_file: 'test.crd',
    charmm_parameters: {
      md: {
        rgyr: [25.0, 30.0, 35.0],
        nsteps: 1000000,
        pdb_report_interval: 1000
      }
    },
    ...overrides
  }
})

const createMockSansJob = (
  overrides: Partial<BilboMDSANSDTO> = {}
): BilboMDJobDTO => ({
  ...createMockJob(),
  mongo: {
    ...createMockJob().mongo,
    jobType: 'sans',
    pdb_file: 'test.pdb',
    d2o_fraction: 85,
    deuteration_fractions: undefined,
    rg_min: 20.0,
    rg_max: 40.0,
    ...overrides
  }
})

describe('jobHandlers', () => {
  describe('createAutoJobHandler', () => {
    const handler = createAutoJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Auto')
    })

    it('should return job-specific properties for auto job with CHARMM', () => {
      const job = createMockAutoJob()
      const properties = handler.getJobSpecificProperties(job)

      const propertyLabels = properties.map((p) => p.label)
      expect(propertyLabels).toContain('PDB file')
      expect(propertyLabels).toContain('PSF file')
      expect(propertyLabels).toContain('CRD file')
      expect(propertyLabels).toContain('MD constraint file')
      expect(propertyLabels).toContain('Number of MD Runs')
      expect(propertyLabels).toContain('Rg values')
      expect(propertyLabels).toContain('Number of conformations')
    })

    it('should calculate MD run count correctly', () => {
      const job = createMockAutoJob()
      const properties = handler.getJobSpecificProperties(job)

      const runCountProp = properties.find(
        (p) => p.label === 'Number of MD Runs'
      )
      expect(runCountProp?.value).toBe(3) // rgyr array length
    })

    it('should format Rg values correctly', () => {
      const job = createMockAutoJob()
      const properties = handler.getJobSpecificProperties(job)

      const rgValuesProp = properties.find((p) => p.label === 'Rg values')
      expect(rgValuesProp?.value).toBe('25 Å, 30 Å, 35 Å')
    })

    it('should calculate conformation count correctly', () => {
      const job = createMockAutoJob()
      const properties = handler.getJobSpecificProperties(job)

      const conformationCountProp = properties.find(
        (p) => p.label === 'Number of conformations'
      )
      // (1000000 * 3) / 1000 = 3000
      expect(conformationCountProp?.value).toBe(3000)
    })

    it('should handle OpenMM engine', () => {
      const job = createMockAutoJob({
        md_engine: 'OpenMM',
        openmm_parameters: {
          md: {
            temperature: 300,
            friction: 0.1,
            timestep: 2,
            k_rg: 1.0,
            rg_report_interval: 500,
            rgyr: [20.0, 25.0],
            nsteps: 500000,
            pdb_report_interval: 2000
          }
        }
      })

      const properties = handler.getJobSpecificProperties(job)
      const runCountProp = properties.find(
        (p) => p.label === 'Number of MD Runs'
      )
      expect(runCountProp?.value).toBe(2) // OpenMM rgyr array length
    })

    it('should not show constraint file for OpenMM jobs', () => {
      const job = createMockAutoJob({ md_engine: 'OpenMM' })
      const properties = handler.getJobSpecificProperties(job)

      const constraintProp = properties.find(
        (p) => p.label === 'MD constraint file'
      )
      expect(constraintProp).toBeUndefined()
    })
  })

  describe('createSansJobHandler', () => {
    const handler = createSansJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD SANS')
    })

    it('should return SANS-specific properties', () => {
      const sansJob = createMockSansJob()

      const properties = handler.getJobSpecificProperties(sansJob)
      const propertyLabels = properties.map((p) => p.label)

      expect(propertyLabels).toContain('PDB file')
      expect(propertyLabels).toContain('Solvent D20 Fraction')
      expect(propertyLabels).toContain('Rg min')
      expect(propertyLabels).toContain('Rg max')
    })
  })

  describe('createPdbJobHandler', () => {
    const handler = createPdbJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Classic w/PDB')
    })
  })

  describe('createCrdJobHandler', () => {
    const handler = createCrdJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Classic w/CRD/PSF')
    })
  })

  describe('createScoperJobHandler', () => {
    const handler = createScoperJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Scoper')
    })

    it('should return minimal properties for scoper job', () => {
      const scoperJob = createMockJob({
        jobType: 'scoper',
        pdb_file: 'test.pdb'
      })

      const properties = handler.getJobSpecificProperties(scoperJob)
      expect(properties).toHaveLength(1)
      expect(properties[0].label).toBe('PDB file')
    })
  })

  describe('createAlphaFoldJobHandler', () => {
    const handler = createAlphaFoldJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD AlphaFold')
    })

    it('should return alphafold-specific properties', () => {
      const job = createMockJob({
        jobType: 'alphafold',
        alphafold_entities: [],
        fasta_file: 'test.fasta'
      })
      const properties = handler.getJobSpecificProperties(job)
      const propertyLabels = properties.map((p) => p.label)

      expect(propertyLabels).toContain('FASTA file')
      expect(propertyLabels).toContain('Number of MD Runs')
      expect(propertyLabels).toContain('Rg values')
      expect(propertyLabels).toContain('Number of conformations')
    })
  })

  describe('createMultiJobHandler', () => {
    const handler = createMultiJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD MultiMD')
    })

    it('should return empty properties array', () => {
      const job = createMockJob({ jobType: 'multi' })
      const properties = handler.getJobSpecificProperties(job)
      expect(properties).toHaveLength(0)
    })
  })

  describe('createOpenFoldJobHandler', () => {
    const handler = createOpenFoldJobHandler()

    it('should return correct display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD OpenFold3')
    })

    it('should return of3-specific properties', () => {
      const job = createMockJob({
        jobType: 'of3',
        openfold_entities: [],
        query_json_file: 'of3-query.json'
      })
      const properties = handler.getJobSpecificProperties(job)
      const propertyLabels = properties.map((p) => p.label)

      expect(propertyLabels).toContain('Query JSON file')
      expect(propertyLabels).toContain('Number of MD Runs')
      expect(propertyLabels).toContain('Rg values')
      expect(propertyLabels).toContain('Number of conformations')
    })
  })
})
