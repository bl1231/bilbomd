import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import userEvent from '@testing-library/user-event'
import BilboMDNerscSteps from '../BilboMDNerscSteps'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'

describe('BilboMDNerscSteps', () => {
  const createMockJob = (jobType: string, status: string, steps: Record<string, unknown> = {}): BilboMDJobDTO => ({
    id: 'job-123',
    username: 'testuser',
    mongo: {
      id: 'job-123',
      title: 'Test Job',
      jobType: jobType as never,
      uuid: 'test-uuid',
      access_mode: 'user',
      status: status as never,
      data_file: 'test.dat',
      md_engine: 'CHARMM',
      time_submitted: new Date('2023-12-01'),
      progress: 50,
      cleanup_in_progress: false,
      user: {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      },
      steps
    }
  } as unknown as BilboMDJobDTO)

  const mockNerscSteps = {
    nersc_prepare_slurm_batch: { status: 'Success', message: 'Prepared' },
    nersc_submit_slurm_batch: { status: 'Success', message: 'Submitted' },
    nersc_job_status: { status: 'Running', message: 'Job ID: 12345' },
    pdb2crd: { status: 'Success', message: 'Converted' },
    minimize: { status: 'Running', message: 'Minimizing' },
    md: { status: 'Waiting', message: '' }
  }

  describe('rendering', () => {
    it('should render NERSC STEPS title', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.getByText('NERSC STEPS')).toBeInTheDocument()
    })

    it('should render accordion expanded when job not completed', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const accordion = screen.getByRole('button', { name: /NERSC STEPS/i })
      expect(accordion).toHaveAttribute('aria-expanded', 'true')
    })

    it('should render accordion collapsed when job completed', () => {
      const job = createMockJob('pdb', 'Completed', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const accordion = screen.getByRole('button', { name: /NERSC STEPS/i })
      expect(accordion).toHaveAttribute('aria-expanded', 'false')
    })

    it('should show "No steps available" when steps are undefined', () => {
      const job = {
        ...createMockJob('pdb', 'Running'),
        mongo: {
          ...createMockJob('pdb', 'Running').mongo,
          steps: undefined
        }
      }

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.getByText('No steps available')).toBeInTheDocument()
    })
  })

  describe('step filtering by job type', () => {
    it('should hide autorg, pdb2crd, pae, alphafold for crd jobs', () => {
      const crdSteps = {
        ...mockNerscSteps,
        autorg: { status: 'Success', message: '' },
        pae: { status: 'Success', message: '' },
        alphafold: { status: 'Success', message: '' }
      }
      const job = createMockJob('crd', 'Running', crdSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.queryByText('AutoRg')).not.toBeInTheDocument()
      expect(screen.queryByText(/PAE matrix/)).not.toBeInTheDocument()
      expect(screen.queryByText('AlphaFold2')).not.toBeInTheDocument()
      expect(screen.queryByText('Convert PDB to CRD')).not.toBeInTheDocument()
    })

    it('should hide autorg, alphafold for auto jobs', () => {
      const autoSteps = {
        ...mockNerscSteps,
        autorg: { status: 'Success', message: '' },
        alphafold: { status: 'Success', message: '' },
        pae: { status: 'Success', message: '' }
      }
      const job = createMockJob('auto', 'Running', autoSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.queryByText('AutoRg')).not.toBeInTheDocument()
      expect(screen.queryByText('AlphaFold2')).not.toBeInTheDocument()
      // PAE should be visible for auto jobs
      expect(screen.getByText(/PAE matrix/)).toBeInTheDocument()
    })

    it('should hide autorg for alphafold jobs', () => {
      const alphafoldSteps = {
        ...mockNerscSteps,
        autorg: { status: 'Success', message: '' },
        alphafold: { status: 'Success', message: '' },
        pae: { status: 'Success', message: '' }
      }
      const job = createMockJob('alphafold', 'Running', alphafoldSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.queryByText('AutoRg')).not.toBeInTheDocument()
      // AlphaFold and PAE should be visible
      expect(screen.getByText('AlphaFold2')).toBeInTheDocument()
      expect(screen.getByText(/PAE matrix/)).toBeInTheDocument()
    })

    it('should hide autorg, pae, alphafold for pdb jobs', () => {
      const pdbSteps = {
        ...mockNerscSteps,
        autorg: { status: 'Success', message: '' },
        pae: { status: 'Success', message: '' },
        alphafold: { status: 'Success', message: '' }
      }
      const job = createMockJob('pdb', 'Running', pdbSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.queryByText('AutoRg')).not.toBeInTheDocument()
      expect(screen.queryByText(/PAE matrix/)).not.toBeInTheDocument()
      expect(screen.queryByText('AlphaFold2')).not.toBeInTheDocument()
    })

    it('should always hide _id field', () => {
      const stepsWithId = {
        ...mockNerscSteps,
        _id: { status: 'Success', message: '' }
      }
      const job = createMockJob('pdb', 'Running', stepsWithId)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.queryByText('_id')).not.toBeInTheDocument()
    })
  })

  describe('step separation', () => {
    it('should separate NERSC steps from BilboMD steps', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      // NERSC steps
      expect(screen.getByText('NERSC Prepare Slurm Batch File')).toBeInTheDocument()
      expect(screen.getByText('NERSC Submit Slurm Batch File')).toBeInTheDocument()
      expect(screen.getByText('NERSC Job Status')).toBeInTheDocument()

      // BilboMD steps
      expect(screen.getByText('Convert PDB to CRD')).toBeInTheDocument()
      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Molecular Dynamics')).toBeInTheDocument()
    })

    it('should display dividers between step sections', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const dividers = document.querySelectorAll('.MuiDivider-root')
      expect(dividers.length).toBeGreaterThan(0)
    })
  })

  describe('step ordering', () => {
    it('should display steps in correct order', () => {
      const unorderedSteps = {
        md: { status: 'Waiting', message: '' },
        nersc_job_status: { status: 'Running', message: '' },
        minimize: { status: 'Success', message: '' },
        nersc_prepare_slurm_batch: { status: 'Success', message: '' },
        pdb2crd: { status: 'Success', message: '' }
      }
      const job = createMockJob('pdb', 'Running', unorderedSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const allText = document.body.textContent || ''

      // NERSC steps should come first
      expect(allText.indexOf('NERSC Prepare')).toBeLessThan(
        allText.indexOf('NERSC Job Status')
      )

      // BilboMD steps should be ordered correctly
      expect(allText.indexOf('Convert PDB')).toBeLessThan(
        allText.indexOf('Minimize')
      )
      expect(allText.indexOf('Minimize')).toBeLessThan(
        allText.indexOf('Molecular Dynamics')
      )
    })
  })

  describe('accordion interaction', () => {
    it('should expand when clicked', async () => {
      const user = userEvent.setup()
      const job = createMockJob('pdb', 'Completed', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const accordion = screen.getByRole('button', { name: /NERSC STEPS/i })
      expect(accordion).toHaveAttribute('aria-expanded', 'false')

      await user.click(accordion)

      expect(accordion).toHaveAttribute('aria-expanded', 'true')
    })

    it('should collapse when clicked again', async () => {
      const user = userEvent.setup()
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const accordion = screen.getByRole('button', { name: /NERSC STEPS/i })
      expect(accordion).toHaveAttribute('aria-expanded', 'true')

      await user.click(accordion)

      expect(accordion).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('INFO section', () => {
    it('should display INFO label', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.getByText(/INFO:/)).toBeInTheDocument()
    })
  })

  describe('empty states', () => {
    it('should handle job with empty steps object', () => {
      const job = createMockJob('pdb', 'Running', {})

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      // Should still render the accordion structure
      expect(screen.getByText('NERSC STEPS')).toBeInTheDocument()
    })

    it('should handle job with only NERSC steps', () => {
      const nerscOnlySteps = {
        nersc_prepare_slurm_batch: { status: 'Success', message: '' },
        nersc_submit_slurm_batch: { status: 'Running', message: '' }
      }
      const job = createMockJob('pdb', 'Running', nerscOnlySteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.getByText('NERSC Prepare Slurm Batch File')).toBeInTheDocument()
      expect(screen.getByText('NERSC Submit Slurm Batch File')).toBeInTheDocument()
    })

    it('should handle job with only BilboMD steps', () => {
      const bilbomdOnlySteps = {
        minimize: { status: 'Success', message: '' },
        md: { status: 'Running', message: '' }
      }
      const job = createMockJob('pdb', 'Running', bilbomdOnlySteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Molecular Dynamics')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should have gray background on accordion header', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const header = screen
        .getByText('NERSC STEPS')
        .closest('.MuiAccordionSummary-root')
      expect(header).toHaveStyle({ backgroundColor: '#888' })
    })

    it('should have expand icon', () => {
      const job = createMockJob('pdb', 'Running', mockNerscSteps)

      renderWithProviders(<BilboMDNerscSteps job={job} />)

      const accordion = screen.getByRole('button', { name: /NERSC STEPS/i })
      const icon = accordion.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })
})
