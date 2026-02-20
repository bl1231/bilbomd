import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import userEvent from '@testing-library/user-event'
import BilboMDMongoSteps from '../BilboMDMongoSteps'
import type { IBilboMDSteps } from '@bilbomd/mongodb-schema'

describe('BilboMDMongoSteps', () => {
  const mockBilboMDSteps: IBilboMDSteps = {
    pdb2crd: { status: 'Success', message: 'PDB converted' },
    minimize: { status: 'Success', message: 'Minimized' },
    heat: { status: 'Running', message: 'Heating model' },
    md: { status: 'Waiting', message: '' },
    foxs: { status: 'Waiting', message: '' },
    multifoxs: { status: 'Waiting', message: '' },
    results: { status: 'Waiting', message: '' }
  }

  const mockScoperSteps = {
    ...mockBilboMDSteps,
    kgs: { status: 'Success', message: 'KGS completed' }
  } as IBilboMDSteps

  describe('rendering', () => {
    it('should render BilboMD Steps title for regular jobs', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      expect(screen.getByText('BilboMD Steps')).toBeInTheDocument()
    })

    it('should render Scoper Steps title for scoper jobs', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockScoperSteps} />)

      expect(screen.getByText('Scoper Steps')).toBeInTheDocument()
    })

    it('should render accordion expanded by default when not completed', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      const accordion = screen.getByRole('button', {
        name: /BilboMD Steps/i
      })
      expect(accordion).toHaveAttribute('aria-expanded', 'true')
    })

    it('should render accordion collapsed when results are successful', () => {
      const completedSteps: IBilboMDSteps = {
        ...mockBilboMDSteps,
        results: { status: 'Success', message: 'Complete' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={completedSteps} />)

      const accordion = screen.getByRole('button', {
        name: /BilboMD Steps/i
      })
      expect(accordion).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('step filtering', () => {
    it('should not display _id field', () => {
      const stepsWithId = {
        ...mockBilboMDSteps,
        _id: { status: 'Success', message: '' }
      } as unknown as IBilboMDSteps

      renderWithProviders(<BilboMDMongoSteps steps={stepsWithId} />)

      expect(screen.queryByText('_id')).not.toBeInTheDocument()
    })

    it('should display all valid steps', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      expect(screen.getByText('Convert PDB to CRD')).toBeInTheDocument()
      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Heating')).toBeInTheDocument()
    })
  })

  describe('step ordering', () => {
    it('should display steps in correct order', () => {
      const unorderedSteps: IBilboMDSteps = {
        results: { status: 'Waiting', message: '' },
        minimize: { status: 'Success', message: '' },
        pdb2crd: { status: 'Success', message: '' },
        md: { status: 'Waiting', message: '' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={unorderedSteps} />)

      const allText = document.body.textContent || ''

      // pdb2crd should come before minimize, minimize before md
      expect(allText.indexOf('Convert PDB to CRD')).toBeLessThan(
        allText.indexOf('Minimize')
      )
      expect(allText.indexOf('Minimize')).toBeLessThan(
        allText.indexOf('Molecular Dynamics')
      )
    })
  })

  describe('latest message display', () => {
    it('should show latest step message', () => {
      const stepsWithMessages: IBilboMDSteps = {
        minimize: { status: 'Success', message: 'First message' },
        heat: { status: 'Running', message: 'Latest message here' },
        md: { status: 'Waiting', message: '' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={stepsWithMessages} />)

      expect(screen.getAllByText('Latest message here').length).toBeGreaterThan(0)
    })

    it('should show message in chip', () => {
      const stepsWithMessages: IBilboMDSteps = {
        minimize: { status: 'Success', message: 'Processing complete' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={stepsWithMessages} />)

      const chips = screen.getAllByText('Processing complete')
      expect(chips.length).toBeGreaterThan(0)
    })

    it('should show waiting message when no custom messages exist', () => {
      const stepsWithoutMessages: IBilboMDSteps = {
        minimize: { status: 'Waiting', message: '' },
        heat: { status: 'Waiting', message: '' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={stepsWithoutMessages} />)

      // Should show "Waiting" for steps without messages
      expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0)
    })
  })

  describe('accordion interaction', () => {
    it('should expand when clicked', async () => {
      const user = userEvent.setup()
      const completedSteps: IBilboMDSteps = {
        ...mockBilboMDSteps,
        results: { status: 'Success', message: '' }
      }

      renderWithProviders(<BilboMDMongoSteps steps={completedSteps} />)

      const accordion = screen.getByRole('button', {
        name: /BilboMD Steps/i
      })
      expect(accordion).toHaveAttribute('aria-expanded', 'false')

      await user.click(accordion)

      expect(accordion).toHaveAttribute('aria-expanded', 'true')
    })

    it('should collapse when clicked again', async () => {
      const user = userEvent.setup()

      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      const accordion = screen.getByRole('button', {
        name: /BilboMD Steps/i
      })
      expect(accordion).toHaveAttribute('aria-expanded', 'true')

      await user.click(accordion)

      expect(accordion).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('scoper detection', () => {
    it('should detect scoper job from kgs step', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockScoperSteps} />)

      expect(screen.getByText('Scoper Steps')).toBeInTheDocument()
    })

    it('should show regular title without kgs step', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      expect(screen.getByText('BilboMD Steps')).toBeInTheDocument()
      expect(screen.queryByText('Scoper Steps')).not.toBeInTheDocument()
    })
  })

  describe('step rendering with BilboMDNerscStep', () => {
    it('should render each step as BilboMDNerscStep component', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      // Each step should be rendered with its friendly name
      expect(screen.getByText('Convert PDB to CRD')).toBeInTheDocument()
      expect(screen.getByText('Minimize')).toBeInTheDocument()
      expect(screen.getByText('Heating')).toBeInTheDocument()
      expect(screen.getByText('Molecular Dynamics')).toBeInTheDocument()
    })

    it('should pass correct props to BilboMDNerscStep', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      // Check that step messages are displayed (from BilboMDNerscStep)
      const allText = document.body.textContent || ''
      expect(allText).toContain('PDB converted')
      expect(allText).toContain('Minimized')
      expect(allText).toContain('Heating model')
    })
  })

  describe('styling', () => {
    it('should have gray background on accordion header', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      const header = screen
        .getByText('BilboMD Steps')
        .closest('.MuiAccordionSummary-root')
      expect(header).toHaveStyle({ backgroundColor: '#888' })
    })

    it('should have expand icon', () => {
      renderWithProviders(<BilboMDMongoSteps steps={mockBilboMDSteps} />)

      const accordion = screen.getByRole('button', {
        name: /BilboMD Steps/i
      })
      const icon = accordion.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })
})
