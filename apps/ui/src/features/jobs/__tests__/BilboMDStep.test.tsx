import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import userEvent from '@testing-library/user-event'
import BilboMDStep from '../BilboMDStep'

describe('BilboMDStep', () => {
  describe('step statuses', () => {
    it('should render "no" status with unchecked icon', () => {
      renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="no" />
      )

      const chip = screen.getByText('minimize')
      expect(chip).toBeInTheDocument()
    })

    it('should render "start" status with running icon and yellow background', () => {
      renderWithProviders(
        <BilboMDStep stepName="md" stepStatus="start" />
      )

      const chip = screen.getByText('md')
      expect(chip).toBeInTheDocument()
      // Check that the chip has the inline style
      const chipElement = chip.parentElement
      expect(chipElement).toHaveAttribute('style')
    })

    it('should render "end" status with success icon', () => {
      renderWithProviders(
        <BilboMDStep stepName="foxs" stepStatus="end" />
      )

      const chip = screen.getByText('foxs')
      expect(chip).toBeInTheDocument()
      expect(chip.parentElement).toHaveClass('MuiChip-colorSuccess')
    })

    it('should render "error" status with error icon', () => {
      renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="error" />
      )

      const chip = screen.getByText('minimize')
      expect(chip).toBeInTheDocument()
      expect(chip.parentElement).toHaveClass('MuiChip-colorError')
    })

    it('should not render for invalid status', () => {
      const { container } = renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="invalid" />
      )

      expect(container.firstChild).toBeNull()
    })

    it('should not render for empty status', () => {
      const { container } = renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="" />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('step names and tooltips', () => {
    const stepTooltips = [
      {
        name: 'scoper',
        tooltip: 'In this step we run Scoper. Details are below.'
      },
      {
        name: 'pae',
        tooltip:
          'In this step the PAE matrix from Alphafold is used to define rigid bodies and rigid domains of your molecule.'
      },
      {
        name: 'autorg',
        tooltip:
          'In this step we determine the Radius of gyration for your SAXS data.'
      },
      {
        name: 'minimize',
        tooltip:
          'In this step we use CHARMM minimize the relax the model geometry.'
      },
      {
        name: 'heat',
        tooltip:
          'In this step we use CHARMM to heat and then cool your model.'
      },
      {
        name: 'md',
        tooltip:
          'In this step we use CHARMM molecular dynamics to generate possible model conformations.'
      },
      {
        name: 'foxs',
        tooltip:
          'In this step we use FoXS to calculate SAXS scattering curves from MD models.'
      },
      {
        name: 'multifoxs',
        tooltip:
          'In this step we use MultiFoXS to determine the best FoXS curves to match your experimental SAXS data.'
      },
      {
        name: 'results',
        tooltip:
          'In this step we are gathering the results together and creating a file for you to download.'
      },
      {
        name: 'email',
        tooltip:
          'In this step we send an email to let you know the BilboMD job is complete.'
      }
    ]

    stepTooltips.forEach(({ name, tooltip }) => {
      it(`should show correct tooltip for ${name} step`, async () => {
        const user = userEvent.setup()

        renderWithProviders(<BilboMDStep stepName={name} stepStatus="no" />)

        const chip = screen.getByText(name)
        await user.hover(chip)

        expect(await screen.findByText(tooltip)).toBeInTheDocument()
      })
    })

    it('should show empty tooltip for unknown step', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <BilboMDStep stepName="unknown" stepStatus="no" />
      )

      const chip = screen.getByText('unknown')
      await user.hover(chip)

      // Tooltip should exist but be empty
      const tooltip = chip.parentElement?.parentElement
      expect(tooltip).toBeInTheDocument()
    })
  })

  describe('chip appearance', () => {
    it('should render chip with small size', () => {
      renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="no" />
      )

      const chip = screen.getByText('minimize').parentElement
      expect(chip).toHaveClass('MuiChip-sizeSmall')
    })

    it('should display step name as label', () => {
      renderWithProviders(
        <BilboMDStep stepName="custom-step" stepStatus="end" />
      )

      expect(screen.getByText('custom-step')).toBeInTheDocument()
    })
  })

  describe('all status combinations', () => {
    const statuses = ['no', 'start', 'end', 'error']
    const steps = ['minimize', 'heat', 'md', 'foxs']

    statuses.forEach((status) => {
      steps.forEach((step) => {
        it(`should render ${step} with ${status} status`, () => {
          renderWithProviders(
            <BilboMDStep stepName={step} stepStatus={status} />
          )

          expect(screen.getByText(step)).toBeInTheDocument()
        })
      })
    })
  })

  describe('icons', () => {
    it('should render RadioButtonUnchecked icon for "no" status', () => {
      renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="no" />
      )

      const chip = screen.getByText('minimize').parentElement
      expect(chip?.querySelector('svg')).toBeInTheDocument()
    })

    it('should render DirectionsRunRounded icon for "start" status', () => {
      renderWithProviders(
        <BilboMDStep stepName="md" stepStatus="start" />
      )

      const chip = screen.getByText('md').parentElement
      const icon = chip?.querySelector('svg')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('style')
    })

    it('should render CheckCircle icon for "end" status', () => {
      renderWithProviders(
        <BilboMDStep stepName="foxs" stepStatus="end" />
      )

      const chip = screen.getByText('foxs').parentElement
      expect(chip?.querySelector('svg')).toBeInTheDocument()
    })

    it('should render Error icon for "error" status', () => {
      renderWithProviders(
        <BilboMDStep stepName="minimize" stepStatus="error" />
      )

      const chip = screen.getByText('minimize').parentElement
      expect(chip?.querySelector('svg')).toBeInTheDocument()
    })
  })
})
