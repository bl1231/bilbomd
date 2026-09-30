import { describe, it, expect, vi } from 'vitest'
import {
  createAutoJobHandler,
  createSansJobHandler,
  createPdbJobHandler,
  createCrdJobHandler,
  createScoperJobHandler,
  createAlphaFoldJobHandler,
  createMultiJobHandler,
  createOpenFoldJobHandler
} from '../jobHandlers'
import type { JobView } from 'features/jobdetail/jobView'
import type { MongoDBProperty } from '../../types'

const makeView = (overrides: Partial<JobView> = {}): JobView => ({
  id: 'job-1',
  jobType: 'auto',
  uuid: 'uuid-1',
  status: 'Completed',
  progress: 100,
  md_engine: 'CHARMM',
  submittedAt: new Date('2023-01-01'),
  ...overrides,
  inputs: {
    data_file: 'test.dat',
    pdb_file: 'test.pdb',
    psf_file: 'test.psf',
    crd_file: 'test.crd',
    const_inp_file: 'const.inp',
    charmm_parameters: {
      md: { rgyr: [25, 30, 35], nsteps: 1000000, pdb_report_interval: 1000 }
    },
    ...overrides.inputs
  }
})

const byLabel = (props: MongoDBProperty[], label: string) =>
  props.find((p) => p.label === label)

const labels = (props: MongoDBProperty[]) => props.map((p) => p.label)

describe('jobHandlers', () => {
  describe('createAutoJobHandler', () => {
    const handler = createAutoJobHandler()

    it('returns its display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Auto')
    })

    it('lists the structure files and MD run summary', () => {
      const props = handler.getJobSpecificProperties(makeView())
      expect(labels(props)).toEqual([
        'PDB file',
        'PSF file',
        'CRD file',
        'MD constraint file',
        'Number of MD Runs',
        'Rg values',
        'Number of conformations'
      ])
      expect(byLabel(props, 'PDB file')?.value).toBe('test.pdb')
      expect(byLabel(props, 'Number of MD Runs')?.value).toBe(3)
      expect(byLabel(props, 'Rg values')?.value).toBe('25 Å, 30 Å, 35 Å')
      expect(byLabel(props, 'Number of conformations')?.value).toBe(3000)
    })

    it('reads OpenMM parameters for OpenMM jobs and has no constraint file', () => {
      const props = handler.getJobSpecificProperties(
        makeView({
          md_engine: 'OpenMM',
          inputs: {
            openmm_parameters: {
              md: {
                rgyr: [20, 40],
                nsteps: 5000,
                pdb_report_interval: 100
              }
            } as JobView['inputs']['openmm_parameters']
          }
        })
      )
      expect(byLabel(props, 'MD constraint file')).toBeUndefined()
      expect(byLabel(props, 'Number of MD Runs')?.value).toBe(2)
      expect(byLabel(props, 'Rg values')?.value).toBe('20 Å, 40 Å')
      expect(byLabel(props, 'Number of conformations')?.value).toBe(100)
    })

    it('treats jobs without an engine as CHARMM', () => {
      const props = handler.getJobSpecificProperties(
        makeView({ md_engine: undefined })
      )
      expect(byLabel(props, 'Number of MD Runs')?.value).toBe(3)
    })

    it('reports zero conformations when MD parameters are missing', () => {
      const props = handler.getJobSpecificProperties(
        makeView({ inputs: { charmm_parameters: undefined } })
      )
      expect(byLabel(props, 'Number of MD Runs')?.value).toBe(0)
      expect(byLabel(props, 'Rg values')?.value).toBeUndefined()
      expect(byLabel(props, 'Number of conformations')?.value).toBe(0)
    })

    it('renders the constraint file as a viewer chip for owners', () => {
      const onOpenModal = vi.fn()
      const prop = byLabel(
        handler.getJobSpecificProperties(makeView(), onOpenModal),
        'MD constraint file'
      )
      expect(prop?.render).toBeDefined()
      expect(prop?.value).toBeUndefined()
    })

    it('shows the plain constraint file name without a viewer', () => {
      const prop = byLabel(
        handler.getJobSpecificProperties(makeView()),
        'MD constraint file'
      )
      expect(prop?.render).toBeUndefined()
      expect(prop?.value).toBe('const.inp')
    })
  })

  describe('createSansJobHandler', () => {
    const handler = createSansJobHandler()

    it('returns its display name', () => {
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD SANS')
    })

    it('includes the D2O fraction and Rg range', () => {
      const props = handler.getJobSpecificProperties(
        makeView({
          jobType: 'sans',
          inputs: { d2o_fraction: 85, rg_min: 20, rg_max: 40 }
        })
      )
      expect(byLabel(props, 'Solvent D20 Fraction')).toMatchObject({
        value: 85,
        suffix: '%'
      })
      expect(byLabel(props, 'Rg min')).toMatchObject({ value: 20, suffix: 'Å' })
      expect(byLabel(props, 'Rg max')).toMatchObject({ value: 40, suffix: 'Å' })
    })
  })

  describe.each([
    ['pdb', createPdbJobHandler, 'BilboMD Classic w/PDB'],
    ['crd', createCrdJobHandler, 'BilboMD Classic w/CRD/PSF']
  ])('%s handler', (_type, create, name) => {
    it('returns its display name', () => {
      expect(create().getJobTypeDisplayName()).toBe(name)
    })

    it('lists the structure files', () => {
      const props = create().getJobSpecificProperties(makeView())
      expect(labels(props)).toContain('PSF file')
      expect(labels(props)).toContain('CRD file')
    })
  })

  describe('createScoperJobHandler', () => {
    it('only lists the PDB file', () => {
      const handler = createScoperJobHandler()
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD Scoper')
      expect(handler.getJobSpecificProperties(makeView())).toEqual([
        { label: 'PDB file', value: 'test.pdb' }
      ])
    })
  })

  describe('createAlphaFoldJobHandler', () => {
    it('includes the FASTA and PAE files', () => {
      const handler = createAlphaFoldJobHandler()
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD AlphaFold')
      const props = handler.getJobSpecificProperties(
        makeView({
          jobType: 'alphafold',
          inputs: { fasta_file: 'seq.fasta', pae_file: 'pae.json' }
        })
      )
      expect(byLabel(props, 'FASTA file')?.value).toBe('seq.fasta')
      expect(byLabel(props, 'PAE file')?.value).toBe('pae.json')
    })
  })

  describe('createOpenFoldJobHandler', () => {
    it('includes the query JSON file', () => {
      const handler = createOpenFoldJobHandler()
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD OpenFold3')
      const props = handler.getJobSpecificProperties(
        makeView({
          jobType: 'openfold',
          inputs: { query_json_file: 'query.json' }
        })
      )
      expect(byLabel(props, 'Query JSON file')?.value).toBe('query.json')
    })
  })

  describe('createMultiJobHandler', () => {
    it('has no job-specific properties', () => {
      const handler = createMultiJobHandler()
      expect(handler.getJobTypeDisplayName()).toBe('BilboMD MultiMD')
      expect(handler.getJobSpecificProperties(makeView())).toEqual([])
    })
  })
})
