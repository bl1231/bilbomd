// Pipeline type utilities for BilboMD
// Shared utilities for converting between different pipeline type representations

import type { PipelineType } from '@bilbomd/mongodb-schema'

/**
 * Converts various pipeline mode strings to standardized PipelineType
 *
 * @param mode - Input mode string (e.g., 'crd_psf', 'BilboMdPdb', 'auto')
 * @returns Standardized PipelineType
 * @throws Error if mode is not recognized as valid pipeline type
 */
export const toPipeline = (mode: string): PipelineType => {
  const originalMode = mode // Preserve original for error messages

  if (!mode || typeof mode !== 'string') {
    throw new Error(`Invalid pipeline mode: ${mode}`)
  }

  // Handle special case mappings
  if (mode === 'crd_psf') return 'crd'

  // Handle mongoose discriminator format (e.g., 'BilboMdPdb' -> 'pdb')
  const withoutDiscriminator = mode.replace(/^BilboMd/i, '').toLowerCase()
  if (withoutDiscriminator && withoutDiscriminator !== mode.toLowerCase()) {
    mode = withoutDiscriminator
  }

  // Convert to lowercase for case-insensitive matching
  const normalizedMode = mode.toLowerCase()

  const validPipelines: PipelineType[] = [
    'pdb',
    'crd',
    'auto',
    'alphafold',
    'openfold',
    'sans',
    'scoper',
    'multi'
  ]

  if (validPipelines.includes(normalizedMode as PipelineType)) {
    return normalizedMode as PipelineType
  }

  throw new Error(`Invalid pipeline mode: ${originalMode}`)
}

/**
 * Converts mongoose discriminator string to pipeline type
 * Optimized for MongoDB aggregation results where __t field contains 'BilboMdXxx'
 *
 * @param discriminator - Mongoose discriminator string (e.g., 'BilboMdPdb')
 * @returns Pipeline type or 'auto' as fallback
 */
export const discriminatorToPipeline = (
  discriminator?: string
): PipelineType => {
  if (!discriminator) return 'auto'

  try {
    return toPipeline(discriminator)
  } catch {
    return 'auto' // Fallback for unrecognized discriminators
  }
}
