import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseScoperLogLine,
  createScoperLogParser
} from '../scoperLogParser.js'
import type { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn(),
  updateJobResults: vi.fn(),
  updateJobProgress: vi.fn()
}))

vi.mock('../helpers/loggers.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import {
  updateStepStatus,
  updateJobResults,
  updateJobProgress
} from '../mongo-utils.js'

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

  it('keeps reduce running on "Adding hydrogens"', async () => {
    await parseScoperLogLine('Adding hydrogens to the structure', mockJob)
    expect(updateStepStatus).toHaveBeenCalledWith(mockJob, 'reduce', {
      status: 'Running',
      message: 'Adding hydrogens.'
    })
    expect(updateJobProgress).not.toHaveBeenCalled()
  })

  it('completes reduce, starts rnaview and sets progress to 15 on "Running rnaview on input pdb"', async () => {
    await parseScoperLogLine('Running rnaview on input pdb file', mockJob)
    expect(vi.mocked(updateStepStatus).mock.calls).toEqual([
      [mockJob, 'reduce', { status: 'Success', message: 'Hydrogens added.' }],
      [mockJob, 'rnaview', { status: 'Running', message: 'RNAView running' }]
    ])
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 15)
  })

  it('completes rnaview, starts kgs and sets progress to 20 on KGS sample count line', async () => {
    await parseScoperLogLine('Running KGS with 1000 samples', mockJob)
    expect(vi.mocked(updateStepStatus).mock.calls).toEqual([
      [mockJob, 'rnaview', { status: 'Success', message: 'RNAView completed' }],
      [mockJob, 'kgs', { status: 'Running', message: 'KGS running' }]
    ])
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 20)
  })

  it('completes kgs, starts foxs and sets progress to 25 on FoXS scores line', async () => {
    await parseScoperLogLine('Getting FoXS scores for 500 structures', mockJob)
    expect(vi.mocked(updateStepStatus).mock.calls).toEqual([
      [mockJob, 'kgs', { status: 'Success', message: 'KGS completed' }],
      [mockJob, 'foxs', { status: 'Running', message: 'FoXS running' }]
    ])
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 25)
  })

  it('completes foxs, starts ionnet and stores top file/score on top_k_pdbs line', async () => {
    await parseScoperLogLine(
      "top_k_pdbs: [('best_model.pdb', 0.9876)]",
      mockJob
    )
    expect(vi.mocked(updateStepStatus).mock.calls).toEqual([
      [mockJob, 'foxs', { status: 'Success', message: 'FoXS completed' }],
      [mockJob, 'ionnet', { status: 'Running', message: 'IonNet running' }]
    ])
    expect(updateJobProgress).toHaveBeenCalledWith(mockJob, 35)
    expect(updateJobResults).toHaveBeenCalledWith(mockJob, {
      'results.scoper.foxs_top_file': 'best_model.pdb',
      'results.scoper.foxs_top_score': 0.9876
    })
  })

  it('stores prediction threshold on threshold line', async () => {
    await parseScoperLogLine(
      'Predicting with a threshold value of 0.5500',
      mockJob
    )
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

describe('createScoperLogParser', () => {
  const stepCalls = () =>
    vi
      .mocked(updateStepStatus)
      .mock.calls.map(([, step, { status }]) => [step, status])

  it('handles every marker when one chunk holds several lines', async () => {
    const parser = createScoperLogParser(mockJob)
    await parser.push(
      'Starting main application...\nAdding hydrogens\nRunning rnaview on input pdb\n'
    )
    expect(stepCalls()).toEqual([
      ['reduce', 'Running'],
      ['reduce', 'Running'],
      ['reduce', 'Success'],
      ['rnaview', 'Running']
    ])
  })

  it('joins a line split across chunks', async () => {
    const parser = createScoperLogParser(mockJob)
    await parser.push('Running KGS with 10')
    expect(updateStepStatus).not.toHaveBeenCalled()
    await parser.push('0 samples, this may take a few minutes\r\n')
    expect(stepCalls()).toEqual([
      ['rnaview', 'Success'],
      ['kgs', 'Running']
    ])
  })

  it('parses a trailing partial line on flush', async () => {
    const parser = createScoperLogParser(mockJob)
    await parser.push('predicted ensemble is of size: 4')
    expect(updateStepStatus).not.toHaveBeenCalled()
    await parser.flush()
    expect(stepCalls()).toEqual([['multifoxs', 'Success']])
  })

  it('applies updates in log order even when an earlier update is slow', async () => {
    let releaseFirst = () => {}
    vi.mocked(updateStepStatus).mockImplementationOnce(
      () => new Promise<void>((r) => (releaseFirst = r))
    )
    const parser = createScoperLogParser(mockJob)
    void parser.push('Getting FoXS scores for 100 structures\n')
    const second = parser.push("top_k_pdbs: [('newpdb_38.pdb', 1.30761)]\n")
    await Promise.resolve()
    expect(stepCalls()).toEqual([['kgs', 'Success']])
    releaseFirst()
    await second
    expect(stepCalls()).toEqual([
      ['kgs', 'Success'],
      ['foxs', 'Running'],
      ['foxs', 'Success'],
      ['ionnet', 'Running']
    ])
  })

  it('keeps parsing after a line fails', async () => {
    vi.mocked(updateStepStatus).mockRejectedValueOnce(new Error('boom'))
    const parser = createScoperLogParser(mockJob)
    await parser.push(
      'Starting main application...\nRunning MultiFoXS Combination\n'
    )
    expect(stepCalls()).toEqual([
      ['reduce', 'Running'],
      ['ionnet', 'Success'],
      ['multifoxs', 'Running']
    ])
  })
})
