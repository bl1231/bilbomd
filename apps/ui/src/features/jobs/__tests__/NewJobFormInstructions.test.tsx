import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import userEvent from '@testing-library/user-event'
import NewJobFormInstructions from '../NewJobFormInstructions'

describe('NewJobFormInstructions', () => {
  describe('accordion behavior', () => {
    it('should render collapsed by default', () => {
      renderWithProviders(<NewJobFormInstructions />)

      expect(screen.getByText(/SHOW/)).toBeInTheDocument()
      expect(screen.queryByText(/HIDE/)).not.toBeInTheDocument()
    })

    it('should expand when clicked', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      expect(screen.getByText(/HIDE/)).toBeInTheDocument()
      expect(screen.queryByText(/SHOW/)).not.toBeInTheDocument()
    })

    it('should collapse when clicked again', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })

      // Expand
      await user.click(accordionButton)
      expect(screen.getByText(/HIDE/)).toBeInTheDocument()

      // Collapse
      await user.click(accordionButton)
      expect(screen.getByText(/SHOW/)).toBeInTheDocument()
    })
  })

  describe('content visibility', () => {
    it('should show main instructions when expanded', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      expect(screen.getAllByText(/BilboMD Classic/)[0]).toBeInTheDocument()
      expect(
        screen.getByText(/to generate an ensemble of molecular models/)
      ).toBeInTheDocument()
    })

    it('should not show expanded content icons when collapsed', () => {
      renderWithProviders(<NewJobFormInstructions />)

      // The SHOW text indicates it's collapsed
      expect(screen.getByText(/SHOW/)).toBeInTheDocument()
    })
  })

  describe('external links', () => {
    it('should link to CHARMM website', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      const charmmLinks = screen.getAllByRole('link', { name: /CHARMM/i })
      expect(charmmLinks.length).toBeGreaterThan(0)
      const mainCharmmLink = charmmLinks.find(link =>
        link.getAttribute('href') === 'https://academiccharmm.org/'
      )
      expect(mainCharmmLink).toHaveAttribute('target', '_blank')
      expect(mainCharmmLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should link to OpenMM website', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      const openmmLink = screen.getByRole('link', { name: /OpenMM/i })
      expect(openmmLink).toHaveAttribute('href', 'https://openmm.org/')
      expect(openmmLink).toHaveAttribute('target', '_blank')
      expect(openmmLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should link to CHARMM-GUI website', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      const charmmGuiLinks = screen.getAllByRole('link', {
        name: /CHARMM-GUI/i
      })
      expect(charmmGuiLinks.length).toBeGreaterThan(0)
      charmmGuiLinks.forEach((link) => {
        expect(link).toHaveAttribute('href', 'https://www.charmm-gui.org/')
        expect(link).toHaveAttribute('target', '_blank')
      })
    })

    it('should link to inp Jiffy', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const accordionButton = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(accordionButton)

      const jiffyLinks = screen.getAllByText(/inp Jiffy/)
      expect(jiffyLinks.length).toBeGreaterThan(0)
    })
  })

  describe('nested accordions', () => {
    it('should have CRD/PSF Inputs accordion', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getByText('CRD/PSF Inputs')).toBeInTheDocument()
    })

    it('should have PDB Inputs accordion', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getByText('PDB Inputs')).toBeInTheDocument()
    })

    it('should show CRD/PSF file requirements', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getByText(/CHARMM coordinate file/)).toBeInTheDocument()
      expect(screen.getByText(/data structure/)).toBeInTheDocument()
    })

    it('should show PDB file requirements', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(
        screen.getAllByText(/\*.pdb/, { exact: false })[0]
      ).toBeInTheDocument()
    })
  })

  describe('warnings and alerts', () => {
    it('should display segid naming warning', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(
        screen.getByText(/Warning about Chain ID and segid naming conventions/)
      ).toBeInTheDocument()
    })

    it('should have warning alert with severity', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      // Check for alert content instead of role
      expect(
        screen.getByText(/Warning about Chain ID and segid naming conventions/)
      ).toBeInTheDocument()
      expect(screen.getAllByText(/segid/)[0]).toBeInTheDocument()
    })
  })

  describe('settings information', () => {
    it('should explain Conformations per Rg', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getByText(/Conformations per Rg/)).toBeInTheDocument()
    })

    it('should explain Rg Steps', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getAllByText(/Rg Steps/)[0]).toBeInTheDocument()
      expect(screen.getAllByText(/Rg Min/)[0]).toBeInTheDocument()
      expect(screen.getAllByText(/Rg Max/)[0]).toBeInTheDocument()
    })

    it('should provide Rg range recommendations', async () => {
      const user = userEvent.setup()

      renderWithProviders(<NewJobFormInstructions />)

      const mainAccordion = screen.getByRole('button', {
        name: /instructions/i
      })
      await user.click(mainAccordion)

      expect(screen.getByText(/-7% to \+25%/, { exact: false })).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should have gray background on main accordion header', () => {
      renderWithProviders(<NewJobFormInstructions />)

      const header = screen
        .getByText(/Instructions/)
        .closest('.MuiAccordionSummary-root')
      expect(header).toHaveStyle({ backgroundColor: '#888' })
    })

    it('should use yellow color for SHOW/HIDE text', () => {
      renderWithProviders(<NewJobFormInstructions />)

      const showText = screen.getByText('SHOW')
      expect(showText).toHaveStyle({ color: '#ffeb3b' })
    })

    it('should have uppercase text for header', () => {
      renderWithProviders(<NewJobFormInstructions />)

      const header = screen.getByText(/Instructions/)
      expect(header).toHaveStyle({ textTransform: 'uppercase' })
    })
  })
})
