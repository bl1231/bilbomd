import { describe, it, expect } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import StepStrip from '../StepStrip'
import { runningSteps } from './fixtures'

const now = new Date('2026-09-01T10:06:30Z')

const renderStrip = () =>
  renderWithProviders(
    <StepStrip
      steps={runningSteps}
      jobType="pdb"
      now={now}
    />
  )

describe('StepStrip', () => {
  it('shows one icon per visible step in pipeline order, NERSC last', () => {
    renderStrip()
    const items = within(screen.getByRole('list', { name: 'job steps' }))
      .getAllByRole('listitem')
      .map((li) => li.firstElementChild?.getAttribute('data-testid'))
    expect(items).toEqual([
      'step-minimize',
      'step-heat',
      'step-md',
      'step-foxs',
      'step-nersc_prepare_slurm_batch',
      'step-nersc_job_status'
    ])
    expect(screen.getByText('NERSC')).toBeInTheDocument()
  })

  it('hides steps this job type skips while they are Waiting', () => {
    renderStrip()
    expect(screen.queryByTestId('step-pae')).not.toBeInTheDocument()
  })

  it('labels the running step', () => {
    renderStrip()
    expect(screen.getByTestId('step-md')).toHaveTextContent(
      'Molecular Dynamics'
    )
    expect(screen.getByTestId('step-minimize')).not.toHaveTextContent(
      'Minimize'
    )
  })

  it('keeps an aligned duration column, empty for untimed steps', () => {
    renderStrip()
    fireEvent.click(screen.getByRole('button', { name: /show details/i }))

    expect(screen.getByTestId('step-duration-minimize')).toHaveTextContent(
      '2m 0s'
    )
    expect(screen.getByTestId('step-duration-foxs')).toBeEmptyDOMElement()
  })

  it('drops the duration column when no step has timing', () => {
    const untimed = {
      minimize: { status: 'Success', message: 'Minimized' },
      md: { status: 'Success', message: 'done' }
    } as unknown as typeof runningSteps
    renderWithProviders(
      <StepStrip
        steps={untimed}
        jobType="pdb"
        now={now}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show details/i }))

    expect(screen.getByText('Minimized')).toBeInTheDocument()
    expect(screen.queryByTestId(/^step-duration-/)).not.toBeInTheDocument()
  })

  it('expands to the full step list with messages and durations', () => {
    renderStrip()
    expect(screen.queryByText('MD run 2 of 4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show details/i }))

    expect(screen.getByText('MD run 2 of 4')).toBeInTheDocument()
    expect(screen.getByText('2m 0s')).toBeInTheDocument()
    expect(screen.getByText('1m 5s')).toBeInTheDocument()
    // Running step: elapsed time so far
    expect(screen.getByText('2m 30s')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /hide details/i })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the step description in a tooltip', async () => {
    renderStrip()
    fireEvent.mouseOver(screen.getByTestId('step-heat'))
    expect(
      await screen.findByText(/heat the starting model/i)
    ).toBeInTheDocument()
    expect(screen.getByText('Heating (Success)')).toBeInTheDocument()
  })

  it('renders nothing without steps', () => {
    const { container } = renderWithProviders(
      <StepStrip
        steps={undefined}
        jobType="pdb"
        now={now}
      />
    )
    expect(container.querySelector('[aria-label="job steps"]')).toBeNull()
  })
})
