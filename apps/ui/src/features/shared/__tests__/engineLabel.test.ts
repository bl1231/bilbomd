import { describe, it, expect } from 'vitest'
import { engineLabel, samplingEngineOverride } from '../engineLabel'

describe('engineLabel', () => {
  it('is the MD engine for the MD pipelines', () => {
    expect(engineLabel('pdb', 'CHARMM')).toBe('CHARMM')
    expect(engineLabel('auto', 'OpenMM')).toBe('OpenMM')
    expect(engineLabel('alphafold', undefined)).toBeUndefined()
  })

  it('names the sampler for pipelines that do not sample with MD', () => {
    expect(engineLabel('scoper', undefined)).toBe('KGSRNA')
    // BioEmu2 jobs store OpenMM, which only polishes the ensemble members
    expect(engineLabel('bioemu', 'OpenMM')).toBe('BioEmu2')
  })
})

describe('samplingEngineOverride', () => {
  it('is undefined for MD pipelines and unknown types', () => {
    expect(samplingEngineOverride('pdb')).toBeUndefined()
    expect(samplingEngineOverride(undefined)).toBeUndefined()
  })
})
