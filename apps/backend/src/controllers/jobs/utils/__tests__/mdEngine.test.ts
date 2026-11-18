import { describe, it, expect } from 'vitest'
import { parseMdEngine } from '../mdEngine.js'

describe('parseMdEngine', () => {
  it('defaults to OpenMM when md_engine is missing or empty', () => {
    expect(parseMdEngine(undefined)).toBe('OpenMM')
    expect(parseMdEngine(null)).toBe('OpenMM')
    expect(parseMdEngine('')).toBe('OpenMM')
  })

  it('accepts either engine case-insensitively', () => {
    expect(parseMdEngine('openmm')).toBe('OpenMM')
    expect(parseMdEngine('OpenMM')).toBe('OpenMM')
    expect(parseMdEngine('charmm')).toBe('CHARMM')
    expect(parseMdEngine(' CHARMM ')).toBe('CHARMM')
  })

  it('falls back to OpenMM for an unknown value', () => {
    expect(parseMdEngine('gromacs')).toBe('OpenMM')
  })
})
