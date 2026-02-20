import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import BilboMDNerscStep from '../BilboMDNerscStep'

describe('BilboMDNerscStep', () => {
  describe('step statuses', () => {
    it('should render Waiting status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Waiting"
          stepMessage=""
        />
      )

      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Waiting')).toBeInTheDocument()
    })

    it('should render Running status with yellow background', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="md"
          stepStatus="Running"
          stepMessage="Processing step 50/100"
        />
      )

      expect(screen.getByText('Molecular Dynamics')).toBeInTheDocument()
      expect(screen.getByText('Processing step 50/100')).toBeInTheDocument()
    })

    it('should render Success status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="foxs"
          stepStatus="Success"
          stepMessage="Completed successfully"
        />
      )

      expect(screen.getByText('FoXS Analysis')).toBeInTheDocument()
      expect(screen.getByText('Completed successfully')).toBeInTheDocument()
    })

    it('should render Error status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Error"
          stepMessage="Minimization failed"
        />
      )

      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Minimization failed')).toBeInTheDocument()
    })

    it('should show "Waiting" when no message provided', () => {
      renderWithProviders(
        <BilboMDNerscStep stepName="heat" stepStatus="Waiting" stepMessage="" />
      )

      expect(screen.getAllByText('Waiting')).toHaveLength(1)
    })
  })

  describe('friendly names', () => {
    const stepMappings = [
      { stepName: 'nersc_prepare_slurm_batch', friendlyName: 'NERSC Prepare Slurm Batch File' },
      { stepName: 'nersc_submit_slurm_batch', friendlyName: 'NERSC Submit Slurm Batch File' },
      { stepName: 'nersc_job_status', friendlyName: 'NERSC Job Status' },
      { stepName: 'alphafold', friendlyName: 'AlphaFold2' },
      { stepName: 'pae', friendlyName: 'Define MD Domains from AlphaFold PAE matrix' },
      { stepName: 'autorg', friendlyName: 'AutoRg' },
      { stepName: 'pdb2crd', friendlyName: 'Convert PDB to CRD' },
      { stepName: 'minimize', friendlyName: 'Minimize' },
      { stepName: 'heat', friendlyName: 'Heating' },
      { stepName: 'md', friendlyName: 'Molecular Dynamics' },
      { stepName: 'foxs', friendlyName: 'FoXS Analysis' },
      { stepName: 'multifoxs', friendlyName: 'MultiFoXS' }
    ]

    stepMappings.forEach(({ stepName, friendlyName }) => {
      it(`should display "${friendlyName}" for step "${stepName}"`, () => {
        renderWithProviders(
          <BilboMDNerscStep
            stepName={stepName}
            stepStatus="Waiting"
            stepMessage=""
          />
        )

        expect(screen.getByText(friendlyName)).toBeInTheDocument()
      })
    })

    it('should use stepName as friendlyName for unknown steps', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="unknown_step"
          stepStatus="Waiting"
          stepMessage=""
        />
      )

      expect(screen.getByText('unknown_step')).toBeInTheDocument()
    })
  })

  describe('tooltips', () => {
    const tooltipTests = [
      {
        stepName: 'alphafold',
        tooltip: 'In this step we use ColabFold to run AlphaFold on your molecule.'
      },
      {
        stepName: 'minimize',
        tooltip: 'In this step we minimize the relax the initial model.'
      },
      {
        stepName: 'md',
        tooltip: 'In this step we run molecular dynamics to generate possible model conformations.'
      },
      {
        stepName: 'foxs',
        tooltip: 'In this step we use FoXS to calculate SAXS scattering curves from MD models.'
      }
    ]

    tooltipTests.forEach(({ stepName, tooltip }) => {
      it(`should show tooltip for ${stepName}`, async () => {
        renderWithProviders(
          <BilboMDNerscStep
            stepName={stepName}
            stepStatus="Waiting"
            stepMessage=""
          />
        )

        // Check for aria-label which contains the tooltip
        const chipElement = document.querySelector(`[aria-label="${tooltip}"]`)
        expect(chipElement).toBeInTheDocument()
      })
    })

    it('should render steps without tooltips', async () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="pdb2crd"
          stepStatus="Waiting"
          stepMessage=""
        />
      )

      // Step should be displayed
      expect(screen.getByText('Convert PDB to CRD')).toBeInTheDocument()
    })
  })

  describe('step messages', () => {
    it('should display custom step message', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="md"
          stepStatus="Running"
          stepMessage="Progress: 75%"
        />
      )

      expect(screen.getByText('Progress: 75%')).toBeInTheDocument()
    })

    it('should show "Waiting" when message is empty', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="foxs"
          stepStatus="Success"
          stepMessage=""
        />
      )

      expect(screen.getByText('Waiting')).toBeInTheDocument()
    })

    it('should display multi-word messages', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Running"
          stepMessage="Minimizing energy levels - iteration 42"
        />
      )

      expect(
        screen.getByText('Minimizing energy levels - iteration 42')
      ).toBeInTheDocument()
    })
  })

  describe('icons', () => {
    it('should render unchecked icon for Waiting status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Waiting"
          stepMessage=""
        />
      )

      const icon = document.querySelector('[data-testid="RadioButtonUncheckedIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render running icon for Running status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="md"
          stepStatus="Running"
          stepMessage=""
        />
      )

      const icon = document.querySelector('[data-testid="DirectionsRunRoundedIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render success icon for Success status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="foxs"
          stepStatus="Success"
          stepMessage=""
        />
      )

      const icon = document.querySelector('[data-testid="CheckCircleIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render error icon for Error status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Error"
          stepMessage=""
        />
      )

      const icon = document.querySelector('[data-testid="ErrorIcon"]')
      expect(icon).toBeInTheDocument()
    })

    it('should render step for unknown status', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Unknown"
          stepMessage=""
        />
      )

      // Step should still render
      expect(screen.getByText('Minimize')).toBeInTheDocument()
    })
  })

  describe('chip colors', () => {
    it('should render success status chip', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="foxs"
          stepStatus="Success"
          stepMessage=""
        />
      )

      expect(screen.getByText('FoXS Analysis')).toBeInTheDocument()
    })

    it('should render error status chip', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="minimize"
          stepStatus="Error"
          stepMessage=""
        />
      )

      expect(screen.getByText('Minimize')).toBeInTheDocument()
    })

    it('should render running status chip', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="md"
          stepStatus="Running"
          stepMessage=""
        />
      )

      expect(screen.getByText('Molecular Dynamics')).toBeInTheDocument()
    })
  })

  describe('NERSC-specific steps', () => {
    it('should display NERSC prepare step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="nersc_prepare_slurm_batch"
          stepStatus="Success"
          stepMessage="Batch file prepared"
        />
      )

      expect(screen.getByText('NERSC Prepare Slurm Batch File')).toBeInTheDocument()
      expect(screen.getByText('Batch file prepared')).toBeInTheDocument()
    })

    it('should display NERSC submit step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="nersc_submit_slurm_batch"
          stepStatus="Running"
          stepMessage="Submitting to queue"
        />
      )

      expect(screen.getByText('NERSC Submit Slurm Batch File')).toBeInTheDocument()
    })

    it('should display NERSC job status step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="nersc_job_status"
          stepStatus="Running"
          stepMessage="Job ID: 12345"
        />
      )

      expect(screen.getByText('NERSC Job Status')).toBeInTheDocument()
      expect(screen.getByText('Job ID: 12345')).toBeInTheDocument()
    })
  })

  describe('Scoper-specific steps', () => {
    it('should display scoper step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="scoper"
          stepStatus="Running"
          stepMessage="Running scoper analysis"
        />
      )

      expect(screen.getByText('Scoper')).toBeInTheDocument()
    })

    it('should display reduce step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="reduce"
          stepStatus="Success"
          stepMessage=""
        />
      )

      expect(screen.getByText('Reduce')).toBeInTheDocument()
    })

    it('should display kgs step', () => {
      renderWithProviders(
        <BilboMDNerscStep stepName="kgs" stepStatus="Running" stepMessage="" />
      )

      expect(screen.getByText('KGS')).toBeInTheDocument()
    })

    it('should display ionnet step', () => {
      renderWithProviders(
        <BilboMDNerscStep
          stepName="ionnet"
          stepStatus="Success"
          stepMessage=""
        />
      )

      expect(screen.getByText('IonNet')).toBeInTheDocument()
    })
  })
})
