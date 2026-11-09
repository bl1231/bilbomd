import { describe, it, expect, vi } from 'vitest'

// Each pipeline is a distinct stub, so the test can tell which one was picked
vi.mock('../../config/config.js', () => ({
  config: { executionBackend: 'local', runOnNERSC: false }
}))
vi.mock('../../services/pipelines/bilbomd-pdb.js', () => ({
  processBilboMDPDBJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-crd.js', () => ({
  processBilboMDCRDJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-auto.js', () => ({
  processBilboMDAutoJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-sans.js', () => ({
  processBilboMDSANSJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-alphafold.js', () => ({
  processBilboMDAlphaFoldJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-openfold.js', () => ({
  processBilboMDOpenFoldJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-bioemu.js', () => ({
  processBilboMDBioEmuJob: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-nersc.js', () => ({
  processBilboMDJobNersc: vi.fn()
}))
vi.mock('../../services/pipelines/bilbomd-k8s.js', () => ({
  processBilboMDJobK8s: vi.fn()
}))

import { getPipelineExecutor } from '../bilboMdHandler.js'
import { processBilboMDPDBJob } from '../../services/pipelines/bilbomd-pdb.js'
import { processBilboMDOpenFoldJob } from '../../services/pipelines/bilbomd-openfold.js'
import { processBilboMDBioEmuJob } from '../../services/pipelines/bilbomd-bioemu.js'
import { processBilboMDJobNersc } from '../../services/pipelines/bilbomd-nersc.js'
import { processBilboMDJobK8s } from '../../services/pipelines/bilbomd-k8s.js'

const TYPES = ['pdb', 'crd_psf', 'auto', 'alphafold', 'openfold', 'sans']

describe('getPipelineExecutor', () => {
  it('runs every job type locally on the local backend', () => {
    expect(getPipelineExecutor('pdb', 'local')).toBe(processBilboMDPDBJob)
    for (const type of TYPES) {
      const executor = getPipelineExecutor(type, 'local')
      expect(executor).toBeTypeOf('function')
      expect(executor).not.toBe(processBilboMDJobNersc)
      expect(executor).not.toBe(processBilboMDJobK8s)
    }
  })

  it('submits to NERSC on the nersc backend, except OpenFold', () => {
    for (const type of TYPES.filter((t) => t !== 'openfold')) {
      expect(getPipelineExecutor(type, 'nersc')).toBe(processBilboMDJobNersc)
    }
    expect(getPipelineExecutor('openfold', 'nersc')).toBe(
      processBilboMDOpenFoldJob
    )
  })

  it('runs every job type as a Kubernetes Job on the k8s backend', () => {
    for (const type of TYPES) {
      expect(getPipelineExecutor(type, 'k8s')).toBe(processBilboMDJobK8s)
    }
  })

  // BioEmu2 calls bioemu2-service, which only runs next to the local worker
  // (epyc) for now: no NERSC path, and no Kubernetes sidecar yet
  it('runs BioEmu2 jobs with the local pipeline only', () => {
    expect(getPipelineExecutor('bioemu', 'local')).toBe(processBilboMDBioEmuJob)
    expect(getPipelineExecutor('bioemu', 'nersc')).toBe(processBilboMDBioEmuJob)
    expect(getPipelineExecutor('bioemu', 'k8s')).toBeNull()
  })

  it('rejects unknown job types on every backend', () => {
    expect(getPipelineExecutor('scoper', 'local')).toBeNull()
    expect(getPipelineExecutor('scoper', 'nersc')).toBeNull()
    expect(getPipelineExecutor('scoper', 'k8s')).toBeNull()
  })
})
