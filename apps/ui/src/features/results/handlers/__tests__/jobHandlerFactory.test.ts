import { createJobHandler } from '../jobHandlerFactory'

describe('jobHandlerFactory', () => {
  describe('createJobHandler', () => {
    const validJobTypes = [
      'auto',
      'sans',
      'pdb',
      'crd',
      'scoper',
      'alphafold',
      'multi'
    ]

    it.each(validJobTypes)(
      'should create handler for %s job type',
      (jobType) => {
        const handler = createJobHandler(jobType)

        expect(handler).toBeDefined()
        expect(typeof handler.getJobSpecificProperties).toBe('function')
        expect(typeof handler.getJobTypeDisplayName).toBe('function')
      }
    )

    it('should throw error for unknown job type', () => {
      expect(() => createJobHandler('unknown')).toThrow(
        'Unknown job type: unknown'
      )
    })

    it('should throw error for empty string job type', () => {
      expect(() => createJobHandler('')).toThrow('Unknown job type: ')
    })

    it('should return different handlers for different job types', () => {
      const autoHandler = createJobHandler('auto')
      const sansHandler = createJobHandler('sans')

      expect(autoHandler.getJobTypeDisplayName()).not.toBe(
        sansHandler.getJobTypeDisplayName()
      )
    })

    it('should create handlers with consistent interface', () => {
      validJobTypes.forEach((jobType) => {
        const handler = createJobHandler(jobType)

        // Test that the handler has the required methods
        expect(handler.getJobSpecificProperties).toBeDefined()
        expect(handler.getJobTypeDisplayName).toBeDefined()

        // Test that getJobTypeDisplayName returns a string
        expect(typeof handler.getJobTypeDisplayName()).toBe('string')
        expect(handler.getJobTypeDisplayName().length).toBeGreaterThan(0)
      })
    })
  })
})
