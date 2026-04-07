import { describe, it, expect } from 'vitest'
import { buildOpenMMParameters } from '../openmmParams.js'

describe('buildOpenMMParameters', () => {
  describe('defaults when no fields provided', () => {
    const params = buildOpenMMParameters({ rg_min: '20', rg_max: '40' })

    it('minimize.max_iterations defaults to 1000', () => {
      expect(params.minimize!.max_iterations).toBe(1000)
    })

    it('heating defaults', () => {
      expect(params.heating!.start_temp).toBe(300)
      expect(params.heating!.final_temp).toBe(600)
      expect(params.heating!.nsteps).toBe(10000)
      expect(params.heating!.timestep).toBe(0.001)
    })

    it('md defaults', () => {
      expect(params.md!.temperature).toBe(600)
      expect(params.md!.friction).toBe(0.1)
      expect(params.md!.nsteps).toBe(300000)
      expect(params.md!.timestep).toBe(0.001)
      expect(params.md!.k_rg).toBe(10)
      expect(params.md!.rg_report_interval).toBe(500)
      expect(params.md!.pdb_report_interval).toBe(500)
    })
  })

  it('uses all provided values instead of defaults', () => {
    const params = buildOpenMMParameters({
      omm_minimize_max_iter: '2000',
      omm_heat_start_temp: '200',
      omm_heat_final_temp: '700',
      omm_heat_nsteps: '5000',
      omm_heat_timestep: '0.002',
      omm_md_temp: '650',
      omm_md_friction: '0.05',
      omm_md_nsteps: '500000',
      omm_md_timestep: '0.002',
      rg_min: '15',
      rg_max: '45',
      omm_md_k_rg: '20',
      omm_md_rg_report_interval: '250',
      omm_md_pdb_report_interval: '250'
    })
    expect(params.minimize!.max_iterations).toBe(2000)
    expect(params.heating!.start_temp).toBe(200)
    expect(params.heating!.final_temp).toBe(700)
    expect(params.heating!.nsteps).toBe(5000)
    expect(params.heating!.timestep).toBeCloseTo(0.002)
    expect(params.md!.temperature).toBe(650)
    expect(params.md!.friction).toBeCloseTo(0.05)
    expect(params.md!.nsteps).toBe(500000)
    expect(params.md!.timestep).toBeCloseTo(0.002)
    expect(params.md!.k_rg).toBe(20)
    expect(params.md!.rg_report_interval).toBe(250)
    expect(params.md!.pdb_report_interval).toBe(250)
  })

  it('rgyr is a 6-element array spanning rg_min to rg_max', () => {
    const params = buildOpenMMParameters({ rg_min: '20', rg_max: '40' })
    expect(params.md!.rgyr).toHaveLength(6)
    expect(params.md!.rgyr![0]).toBe(20)
    expect(params.md!.rgyr![5]).toBe(40)
  })

  it('friction uses parseFloat not parseInt', () => {
    const params = buildOpenMMParameters({
      omm_md_friction: '0.15',
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.md!.friction).toBeCloseTo(0.15)
  })

  it('timesteps use parseFloat not parseInt', () => {
    const params = buildOpenMMParameters({
      omm_heat_timestep: '0.003',
      omm_md_timestep: '0.003',
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.heating!.timestep).toBeCloseTo(0.003)
    expect(params.md!.timestep).toBeCloseTo(0.003)
  })

  it('partial override: unset fields still get defaults', () => {
    const params = buildOpenMMParameters({
      omm_minimize_max_iter: '500',
      rg_min: '20',
      rg_max: '40'
    })
    expect(params.minimize!.max_iterations).toBe(500)
    expect(params.heating!.start_temp).toBe(300)
    expect(params.md!.nsteps).toBe(300000)
  })
})
