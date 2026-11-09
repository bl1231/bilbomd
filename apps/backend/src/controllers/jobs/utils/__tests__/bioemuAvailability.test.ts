import { describe, it, expect, afterEach } from 'vitest'
import {
  bioemuEnabled,
  bioemuUnsupportedBackend
} from '../bioemuAvailability.js'

const VARS = ['ENABLE_BILBOMD_BIOEMU', 'EXECUTION_BACKEND', 'USE_NERSC']

afterEach(() => {
  for (const name of VARS) delete process.env[name]
})

describe('bioemuUnsupportedBackend', () => {
  it('allows a local deployment', () => {
    expect(bioemuUnsupportedBackend()).toBeNull()
    process.env.EXECUTION_BACKEND = 'local'
    expect(bioemuUnsupportedBackend()).toBeNull()
  })

  it('names the Kubernetes and NERSC backends', () => {
    process.env.EXECUTION_BACKEND = ' K8s '
    expect(bioemuUnsupportedBackend()).toBe('k8s')
    process.env.EXECUTION_BACKEND = 'nersc'
    expect(bioemuUnsupportedBackend()).toBe('nersc')
  })

  it('falls back to USE_NERSC, which EXECUTION_BACKEND overrides', () => {
    process.env.USE_NERSC = 'true'
    expect(bioemuUnsupportedBackend()).toBe('nersc')
    process.env.EXECUTION_BACKEND = 'local'
    expect(bioemuUnsupportedBackend()).toBeNull()
  })
})

describe('bioemuEnabled', () => {
  it('needs the flag', () => {
    expect(bioemuEnabled()).toBe(false)
    process.env.ENABLE_BILBOMD_BIOEMU = 'true'
    expect(bioemuEnabled()).toBe(true)
  })

  it('is off on a deployment that cannot run the pipeline', () => {
    process.env.ENABLE_BILBOMD_BIOEMU = 'true'
    process.env.EXECUTION_BACKEND = 'k8s'
    expect(bioemuEnabled()).toBe(false)
  })
})
