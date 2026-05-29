import type { JobHandler } from '../types'
import {
  createAutoJobHandler,
  createSansJobHandler,
  createPdbJobHandler,
  createCrdJobHandler,
  createScoperJobHandler,
  createAlphaFoldJobHandler,
  createMultiJobHandler,
  createOpenFoldJobHandler
} from './jobHandlers'

export const createJobHandler = (jobType: string): JobHandler => {
  switch (jobType) {
    case 'auto':
      return createAutoJobHandler()
    case 'sans':
      return createSansJobHandler()
    case 'pdb':
      return createPdbJobHandler()
    case 'crd':
      return createCrdJobHandler()
    case 'scoper':
      return createScoperJobHandler()
    case 'alphafold':
      return createAlphaFoldJobHandler()
    case 'openfold':
      return createOpenFoldJobHandler()
    case 'multi':
      return createMultiJobHandler()
    default:
      throw new Error(`Unknown job type: ${jobType}`)
  }
}
