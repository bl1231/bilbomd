import { describe, it, expect } from 'vitest'
import { bioemuFormData } from '../bioemuFormData'

describe('bioemuFormData', () => {
  it('sends the bioemu mode and every entity field', () => {
    const form = bioemuFormData({
      title: 'pp1-ptg',
      dat_file: 'saxs.dat',
      q_units: 'auto',
      entities: [
        {
          id: '1',
          name: 'pro-1',
          sequence: 'ACDEFGHIKL',
          type: 'Protein',
          copies: 2
        },
        { id: '2', name: 'dna-2', sequence: 'ACGT', type: 'DNA', copies: 1 }
      ]
    })
    expect(form.get('bilbomd_mode')).toBe('bioemu')
    expect(form.get('title')).toBe('pp1-ptg')
    expect(form.get('q_units')).toBe('auto')
    expect(form.get('entities[0][sequence]')).toBe('ACDEFGHIKL')
    expect(form.get('entities[0][copies]')).toBe('2')
    expect(form.get('entities[1][type]')).toBe('DNA')
  })

  it('upper-cases sequences, which the backend requires', () => {
    const form = bioemuFormData({
      title: 'lower',
      dat_file: 'saxs.dat',
      q_units: 'auto',
      entities: [
        {
          id: '1',
          name: 'pro-1',
          sequence: ' acdefGHIklm ',
          type: 'Protein',
          copies: 1
        }
      ]
    })
    expect(form.get('entities[0][sequence]')).toBe('ACDEFGHIKLM')
  })
})
