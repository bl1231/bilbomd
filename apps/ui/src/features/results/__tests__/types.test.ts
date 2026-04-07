import type { MongoDBProperty, JobHandler, HasConstraintFile } from '../types'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'

describe('types', () => {
  describe('MongoDBProperty', () => {
    it('should accept all valid property configurations', () => {
      const basicProp: MongoDBProperty = {
        label: 'Test Label',
        value: 'Test Value'
      }

      const propWithSuffix: MongoDBProperty = {
        label: 'Size',
        value: 10,
        suffix: 'MB'
      }

      const propWithRender: MongoDBProperty = {
        label: 'Custom',
        render: () => null
      }

      const propWithDate: MongoDBProperty = {
        label: 'Created',
        value: new Date()
      }

      expect(basicProp.label).toBe('Test Label')
      expect(propWithSuffix.suffix).toBe('MB')
      expect(propWithRender.render).toBeDefined()
      expect(propWithDate.value).toBeInstanceOf(Date)
    })
  })

  describe('JobHandler', () => {
    it('should define correct interface structure', () => {
      const mockHandler: JobHandler = {
        getJobSpecificProperties: (_job: BilboMDJobDTO) => [],
        getJobTypeDisplayName: () => 'Test Job'
      }

      expect(typeof mockHandler.getJobSpecificProperties).toBe('function')
      expect(typeof mockHandler.getJobTypeDisplayName).toBe('function')
      expect(mockHandler.getJobTypeDisplayName()).toBe('Test Job')
    })
  })

  describe('HasConstraintFile', () => {
    it('should accept objects with optional const_inp_file', () => {
      const withConstraint: HasConstraintFile = {
        const_inp_file: 'constraints.inp'
      }

      const withoutConstraint: HasConstraintFile = {}

      expect(withConstraint.const_inp_file).toBe('constraints.inp')
      expect(withoutConstraint.const_inp_file).toBeUndefined()
    })
  })
})
