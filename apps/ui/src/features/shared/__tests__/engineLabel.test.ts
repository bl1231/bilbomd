import { describe, it, expect } from 'vitest'
import { hasNoMdEngine, mdEngineFor } from '../engineLabel'

describe('mdEngineFor', () => {
  it('is the stored engine for the MD pipelines', () => {
    expect(mdEngineFor('pdb', 'CHARMM')).toBe('CHARMM')
    expect(mdEngineFor('auto', 'OpenMM')).toBe('OpenMM')
    expect(mdEngineFor('alphafold', undefined)).toBeUndefined()
  })

  it('shows KGSRNA in the engine place for Scoper', () => {
    expect(mdEngineFor('scoper', undefined)).toBe('KGSRNA')
  })

  it('is nothing for BioEmu2, whose OpenMM only polishes the ensembles', () => {
    expect(mdEngineFor('bioemu', 'OpenMM')).toBeUndefined()
    expect(hasNoMdEngine('bioemu')).toBe(true)
    expect(hasNoMdEngine('pdb')).toBe(false)
  })
})
