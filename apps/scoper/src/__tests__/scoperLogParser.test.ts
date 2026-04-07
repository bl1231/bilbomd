import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseScoperLogLine } from '../scoperLogParser.js'
import type { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(),
  updateJobResults: vi.fn(),
  updateJobProgress: vi.fn()
}))

import { updateStepStatus, updateJobResults, updateJobProgress } from '../mongo-utils.js'

const mockJob = {} as IBilboMDScoperJob

beforeEach(() => vi.clearAllMocks())

describe('parseScoperLogLine', () => {
  it('starts reduce step on "Starting main application..."', async () => {
    await parseScoperLogLine('Starting main application...', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'reduce', {
      status: 'Running',
      message: 'Starting reduce step.'
    })
    expect(updateJobProgress).not.toHaveBeenCalled()
  })

  it('completes reduce step and sets progress to 15 on "Adding hydrogens"', async () => {
    await parseScoperLogLine('Adding hydrogens to the structure', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'reduce', {
      status: 'Success',
      message: 'Hydrogens added.'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 15)
  })

  it('completes rnaview step and sets progress to 20 on "Running rnaview on input pdb"', async () => {
    await parseScoperLogLine('Running rnaview on input pdb file', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'rnaview', {
      status: 'Success',
      message: 'RNAView completed'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 20)
  })

  it('completes kgs step and sets progress to 25 on KGS sample count line', async () => {
    await parseScoperLogLine('Running KGS with 1000 samples', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'kgs', {
      status: 'Success',
      message: 'KGS completed'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 25)
  })

  it('starts foxs step on FoXS scores line', async () => {
    await parseScoperLogLine('Getting FoXS scores for 500 structures', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'foxs', {
      status: 'Running',
      message: 'FoXS running'
    })
    expect(updateJobProgress).not.toHaveBeenCalled()
  })

  it('completes foxs step and stores top file/score on top_k_pdbs line', async () => {
    await parseScoperLogLine(
      "top_k_pdbs: [('best_model.pdb', 0.9876)]",
      mockJob
    )
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'foxs', {
      status: 'Success',
      message: 'FoXS completed'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 35)
    expect(updateJobResults).toHaveBeenCalledWith(mockJob, {
      'results.scoper.foxs_top_file': 'best_model.pdb',
      'results.scoper.foxs_top_score': 0.9876
    })
  })

  it('stores prediction threshold on threshold line', async () => {
    await parseScoperLogLine('Predicting with a threshold value of 0.5500', mockJob)
    expect(updateJobResults).toHaveBeenCalledWith(mockJob, {
      'results.scoper.prediction_threshold': 0.55
    })
    expect(updateStepStatus).not.toHaveBeenCalled()
  })

  it('completes ionnet, starts multifoxs and sets progress to 60 on MultiFoXS Combination line', async () => {
    await parseScoperLogLine('Running MultiFoXS Combination', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'ionnet', {
      status: 'Success',
      message: 'IonNet completed'
    })
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'multifoxs', {
      status: 'Running',
      message: 'MultiFoXS running'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 60)
  })

  it('completes multifoxs, sets progress to 70, and stores ensemble size', async () => {
    await parseScoperLogLine('predicted ensemble is of size: 3', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'multifoxs', {
      status: 'Success',
      message: 'MultiFoXS completed'
    })
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 70)
    expect(updateJobResults).toHaveBeenCalledWith(mockJob, {
      'results.scoper.multifoxs_ensemble_size': 3
    })
  })

  it('stores lowest scoring ensemble score', async () => {
    await parseScoperLogLine('The lowest scoring ensemble is 1.2345', mockJob)
    expect(updateJobResults).toHaveBeenCalledWith(mockJob, {
      'results.scoper.multifoxs_score': 1.2345
    })
  })

  it('does nothing for an unrecognized line', async () => {
    await parseScoperLogLine('some random log output', mockJob)
    expect(updateStepStatus).not.toHaveBeenCalled()
    expect(updateJobProgress).not.toHaveBeenCalled()
    expect(updateJobResults).not.toHaveBeenCalled()
  })
})
