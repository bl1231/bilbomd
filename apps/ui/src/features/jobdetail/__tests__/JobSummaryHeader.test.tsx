import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobSummaryHeader from '../JobSummaryHeader'
import { mdEngineLabel } from '../jobPageModel'
import { makeView } from './fixtures'

describe('JobSummaryHeader', () => {
  it('shows the title, back button and job metadata to owners', () => {
    renderWithProviders(
      <JobSummaryHeader
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView()}
      />
    )
    expect(screen.getByText('My Job')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /back to jobs list/i })
    ).toBeInTheDocument()
    expect(screen.getByText('BilboMD Classic w/PDB')).toBeInTheDocument()
    expect(screen.getByText('OpenMM')).toBeInTheDocument()
    expect(screen.getByText('Submitted:')).toBeInTheDocument()
    expect(screen.getByText('Completed:')).toBeInTheDocument()
    expect(screen.queryByText('Permalink:')).not.toBeInTheDocument()
  })

  it('shows the permalink but no back button on public pages', () => {
    renderWithProviders(
      <JobSummaryHeader
        source={{ kind: 'public', token: 'tok-1' }}
        view={makeView({ completedAt: undefined })}
      />
    )
    expect(screen.getByText('Permalink:')).toBeInTheDocument()
    expect(screen.getByText(/\/results\/tok-1$/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /back to jobs list/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Completed:')).not.toBeInTheDocument()
  })

  it('copes with a public job that has no title', () => {
    renderWithProviders(
      <JobSummaryHeader
        source={{ kind: 'public', token: 'tok-1' }}
        view={makeView({ title: undefined })}
      />
    )
    expect(screen.getByText('BilboMD Classic w/PDB')).toBeInTheDocument()
  })

  it('falls back to the raw job type name when it has no handler', () => {
    renderWithProviders(
      <JobSummaryHeader
        source={{ kind: 'public', token: 'tok-1' }}
        view={makeView({ jobType: 'mystery' as never })}
      />
    )
    expect(screen.getByText('mystery')).toBeInTheDocument()
  })
})

describe('mdEngineLabel', () => {
  it('names the engine for each job type', () => {
    expect(mdEngineLabel(makeView({ jobType: 'scoper' }))).toBe('KGSRNA')
    expect(mdEngineLabel(makeView({ jobType: 'multi' }))).toBeUndefined()
    expect(mdEngineLabel(makeView({ md_engine: undefined }))).toBe('CHARMM')
    expect(mdEngineLabel(makeView({ md_engine: 'OpenMM' }))).toBe('OpenMM')
  })
})
