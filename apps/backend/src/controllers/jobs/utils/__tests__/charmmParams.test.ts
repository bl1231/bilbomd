import { describe, it, expect } from 'vitest'
import { buildCHARMMParameters } from '../charmmParams.js'

describe('buildCHARMMParameters', () => {
  it('uses provided nsteps and pdb_report_interval', () => {
    const params = buildCHARMMParameters({
      charmm_md_nsteps: '200000',
      charmm_md_pdb_report_interval: '1000',
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.nsteps).toBe(200000)
    expect(params.md!.pdb_report_interval).toBe(1000)
  })

  it('falls back to num_conf * 100000 when nsteps is absent', () => {
    const params = buildCHARMMParameters({
      num_conf: 3,
      charmm_md_pdb_report_interval: '500',
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.nsteps).toBe(300000)
  })

  it('defaults nsteps to 300000 when both nsteps and num_conf are absent', () => {
    const params = buildCHARMMParameters({
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.nsteps).toBe(300000)
  })

  it('defaults pdb_report_interval to 500 when absent', () => {
    const params = buildCHARMMParameters({
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.pdb_report_interval).toBe(500)
  })

  it('rgyr is a 6-element array from calculateRgyrRange', () => {
    const params = buildCHARMMParameters({
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.rgyr).toHaveLength(6)
    expect(params.md!.rgyr![0]).toBe(20)
    expect(params.md!.rgyr![5]).toBe(40)
  })

  it('minimize and heating are empty objects', () => {
    const params = buildCHARMMParameters({
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.minimize).toEqual({})
    expect(params.heating).toEqual({})
  })
})
