/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs-extra', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import fs from 'fs-extra'
import { createReadmeFile } from '../create-readme-file.js'

const base = {
  _id: 'job-id-123',
  uuid: 'uuid-abc-123',
  title: 'Test Job',
  time_submitted: new Date('2025-01-01'),
  data_file: 'saxs_data.dat'
}

describe('createReadmeFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a CRD README with correct filenames', async () => {
    const job = {
      ...base,
      __t: 'BilboMdCRD',
      crd_file: 'protein.crd',
      psf_file: 'protein.psf',
      const_inp_file: 'const.inp'
    }
    await createReadmeFile(job as any, 3, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('minimization_output.pdb')
    expect(written).toContain('minimization_output_saxs_data.dat')
    expect(written).toContain('protein.crd')
    expect(written).toContain('Number of ensembles for this BilboMD run: 3')
  })

  it('generates a PDB README with correct filenames', async () => {
    const job = {
      ...base,
      __t: 'BilboMdPDB',
      pdb_file: 'protein.pdb',
      crd_file: 'protein.crd',
      psf_file: 'protein.psf',
      const_inp_file: 'const.inp'
    }
    await createReadmeFile(job as any, 2, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('minimization_output.pdb')
    expect(written).toContain('protein.pdb')
  })

  it('generates an Auto README', async () => {
    const job = {
      ...base,
      __t: 'BilboMdAuto',
      pdb_file: 'protein.pdb',
      pae_file: 'pae.json',
      crd_file: 'protein.crd',
      psf_file: 'protein.psf',
      const_inp_file: 'const.inp'
    }
    await createReadmeFile(job as any, 4, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('pae.json')
    expect(written).toContain('minimization_output.pdb')
  })

  it('generates an AlphaFold README', async () => {
    const job = {
      ...base,
      __t: 'BilboMdAlphaFold',
      fasta_file: 'protein.fasta'
    }
    await createReadmeFile(job as any, 1, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('af-rank1.pdb')
    expect(written).toContain('af-pae.json')
    expect(written).toContain('protein.fasta')
  })

  it('generates an OpenFold README', async () => {
    const job = { ...base, __t: 'BilboMdOpenFold' }
    await createReadmeFile(job as any, 2, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('of3-rank1.pdb')
    expect(written).toContain('of3-pae.json')
  })

  it('generates a SANS README without SAXS feedback references', async () => {
    const job = {
      ...base,
      __t: 'BilboMdSANS',
      pdb_file: 'protein.pdb',
      crd_file: 'protein.crd',
      psf_file: 'protein.psf',
      const_inp_file: 'const.inp'
    }
    await createReadmeFile(job as any, 3, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('BilboMD SANS')
    expect(written).toContain('Pepsi-SANS')
    expect(written).toContain('gasans_summary_EnsSizeN.csv')
    expect(written).not.toContain('TODO')
  })

  it('generates a MultiJob README with SAXS data filename', async () => {
    const job = {
      ...base,
      __t: 'MultiJob',
      bilbomd_uuids: ['uuid-1', 'uuid-2'],
      data_file_from: 'uuid-1'
    }
    await createReadmeFile(job as any, 3, '/results', 'experiment.dat')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('BilboMD Multi')
    expect(written).toContain('experiment.dat')
    expect(written).toContain('ensemble_size_N_model.pdb')
  })

  it('logs a warning and writes a fallback for unknown job type', async () => {
    const job = { ...base, __t: 'UnknownType' }
    await createReadmeFile(job as any, 0, '/results')
    const written = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(written).toContain('UnknownType')
  })
})
