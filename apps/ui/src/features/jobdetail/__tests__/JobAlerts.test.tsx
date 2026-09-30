import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { JobStepsDTO } from '@bilbomd/bilbomd-types'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobAlerts from '../JobAlerts'
import { makeView } from './fixtures'

const steps = (s: Record<string, { status: string; message: string }>) =>
  s as unknown as JobStepsDTO

describe('JobAlerts', () => {
  it('renders nothing for a healthy job', () => {
    renderWithProviders(<JobAlerts view={makeView()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns when MD fell back to the CPU', () => {
    renderWithProviders(
      <JobAlerts
        view={makeView({
          steps: steps({
            md: { status: 'Success', message: 'CUDA unavailable, used CPU' }
          })
        })}
      />
    )
    expect(screen.getByText('MD ran on CPU')).toBeInTheDocument()
  })

  it('shows the failing step message and the UUID, with no Register link', () => {
    renderWithProviders(
      <JobAlerts
        view={makeView({
          status: 'Error',
          steps: steps({
            minimize: { status: 'Error', message: 'Traceback: boom' }
          })
        })}
      />
    )
    expect(screen.getAllByText('Job Failed').length).toBeGreaterThan(0)
    expect(screen.getByText('Traceback: boom')).toBeInTheDocument()
    expect(screen.getByText('uuid-1234')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /regist|account/i })
    ).not.toBeInTheDocument()
  })

  it('uses a generic message when no step recorded an error', () => {
    renderWithProviders(<JobAlerts view={makeView({ status: 'Failed' })} />)
    expect(
      screen.getByText('An unexpected error occurred.')
    ).toBeInTheDocument()
  })
})
