import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import JobSuccessAlert from '../JobSuccessAlert'

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = (await vi.importActual('react-router')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('JobSuccessAlert', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  const mockJobResponse = {
    message: 'Job created successfully',
    jobid: 'job-123',
    uuid: 'uuid-123',
    md_engine: 'CHARMM'
  }

  describe('rendering', () => {
    it('should render success alert with job type', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="auto" />
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Job submitted!')).toBeInTheDocument()
      expect(screen.getByText(/BilboMD auto job/)).toBeInTheDocument()
    })

    it('should display MD engine in alert text', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="pdb" />
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/CHARMM/)
    })

    it('should show monitoring message when jobid is present', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="auto" />
      )

      expect(
        screen.getByText('You can monitor the status of your job here:')
      ).toBeInTheDocument()
    })
  })

  describe('MD engine display', () => {
    it('should display OpenMM engine', () => {
      const openMMResponse = { ...mockJobResponse, md_engine: 'OpenMM' }
      renderWithProviders(
        <JobSuccessAlert jobResponse={openMMResponse} jobType="auto" />
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/OpenMM/)
    })

    it('should display CHARMM engine', () => {
      const charmmResponse = { ...mockJobResponse, md_engine: 'CHARMM' }
      renderWithProviders(
        <JobSuccessAlert jobResponse={charmmResponse} jobType="pdb" />
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/CHARMM/)
    })

    it('should not mention Molecular Dynamics when md_engine is undefined (scoper)', () => {
      const scoperResponse = {
        message: 'Job created successfully',
        jobid: 'job-456',
        uuid: 'uuid-456'
      }
      renderWithProviders(
        <JobSuccessAlert jobResponse={scoperResponse} jobType="scoper" />
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/BilboMD scoper job/)
      expect(alert).not.toHaveTextContent(/Molecular Dynamics/)
      expect(alert).not.toHaveTextContent(/CHARMM/)
      expect(alert).not.toHaveTextContent(/OpenMM/)
    })
  })

  describe('View Job Status button', () => {
    it('should render button when jobid is present', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="auto" />
      )

      const button = screen.getByRole('button', { name: /View Job Status/i })
      expect(button).toBeInTheDocument()
    })

    it('should not render button when jobid is missing', () => {
      const noJobIdResponse = {
        message: 'Job created',
        jobid: '',
        uuid: 'uuid-123',
        md_engine: 'CHARMM'
      }
      renderWithProviders(
        <JobSuccessAlert jobResponse={noJobIdResponse} jobType="auto" />
      )

      const button = screen.queryByRole('button', { name: /View Job Status/i })
      expect(button).not.toBeInTheDocument()
    })

    it('should navigate to job page when button is clicked', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="auto" />
      )

      const button = screen.getByRole('button', { name: /View Job Status/i })
      button.click()

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/jobs/job-123')
    })

    it('should render button with launch icon', () => {
      renderWithProviders(
        <JobSuccessAlert jobResponse={mockJobResponse} jobType="auto" />
      )

      const button = screen.getByRole('button', { name: /View Job Status/i })
      expect(button).toBeInTheDocument()
      expect(button).toHaveTextContent('View Job Status')
    })
  })

  describe('job types', () => {
    const jobTypes = ['pdb', 'crd', 'auto', 'alphafold', 'sans', 'scoper']

    jobTypes.forEach((jobType) => {
      it(`should display correct text for ${jobType} job type`, () => {
        renderWithProviders(
          <JobSuccessAlert jobResponse={mockJobResponse} jobType={jobType} />
        )

        expect(
          screen.getByText(new RegExp(`BilboMD ${jobType} job`))
        ).toBeInTheDocument()
      })
    })
  })

  describe('conditional rendering', () => {
    it('should handle missing jobResponse gracefully', () => {
      const partialResponse = {
        message: 'Job created',
        jobid: '',
        uuid: '',
        md_engine: 'CHARMM'
      }

      renderWithProviders(
        <JobSuccessAlert jobResponse={partialResponse} jobType="auto" />
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('should show monitoring text only when jobid exists', () => {
      const noIdResponse = {
        ...mockJobResponse,
        jobid: ''
      }

      renderWithProviders(
        <JobSuccessAlert jobResponse={noIdResponse} jobType="auto" />
      )

      expect(
        screen.queryByText('You can monitor the status of your job here:')
      ).not.toBeInTheDocument()
    })
  })
})
