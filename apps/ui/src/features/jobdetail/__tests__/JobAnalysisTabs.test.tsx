import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobAnalysisTabs from '../JobAnalysisTabs'
import { analysisTabs } from '../jobPageModel'
import { makeView } from './fixtures'

vi.mock('features/jobs/FoXSAnalysis', () => ({
  default: (props: { id?: string; isPublic: boolean; publicId?: string }) => (
    <div data-testid="foxs">{JSON.stringify(props)}</div>
  )
}))
vi.mock('features/analysis/BilboMdFeedback', () => ({
  default: (props: { feedback?: unknown; publicId?: string }) => (
    <div data-testid="feedback">{JSON.stringify(props)}</div>
  )
}))
vi.mock('features/analysis/MovieGallery', () => ({
  default: () => <div data-testid="movies" />
}))
const useJobMovies = vi.fn()
vi.mock('../useJobView', () => ({
  useJobMovies: (...args: unknown[]) => useJobMovies(...args)
}))

describe('analysisTabs', () => {
  it('picks the tabs each job type has', () => {
    expect(analysisTabs('pdb')).toEqual(['foxs', 'movies', 'feedback'])
    expect(analysisTabs('alphafold')).toEqual(['foxs', 'movies', 'feedback'])
    expect(analysisTabs('sans')).toEqual(['movies'])
    expect(analysisTabs('scoper')).toEqual([])
    expect(analysisTabs('multi')).toEqual([])
  })
})

describe('JobAnalysisTabs', () => {
  it('loads FoXS from the owner endpoint for owners', async () => {
    renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView()}
        eventsConnected={false}
      />
    )
    expect(await screen.findByTestId('foxs')).toHaveTextContent(
      '"id":"job-1","isPublic":false'
    )
  })

  it('loads FoXS by token on public pages', async () => {
    renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'public', token: 'tok' }}
        view={makeView()}
        eventsConnected={false}
      />
    )
    expect(await screen.findByTestId('foxs')).toHaveTextContent(
      '"isPublic":true,"publicId":"tok"'
    )
  })

  it('shows the owner feedback from the job and public feedback by token', () => {
    const { unmount } = renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView({ feedback: { mw_saxs: 1 } as never })}
        eventsConnected={false}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Feedback' }))
    expect(screen.getByTestId('feedback')).toHaveTextContent('"mw_saxs":1')
    unmount()

    renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'public', token: 'tok' }}
        view={makeView()}
        eventsConnected={false}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Feedback' }))
    expect(screen.getByTestId('feedback')).toHaveTextContent('"publicId":"tok"')
  })

  it('shows the movie gallery, passing the event state through', () => {
    useJobMovies.mockReturnValue({ data: { movies: [] }, isLoading: false })
    const source = { kind: 'owner', id: 'job-1' } as const
    renderWithProviders(
      <JobAnalysisTabs
        source={source}
        view={makeView({ jobType: 'sans' })}
        eventsConnected
      />
    )
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByTestId('movies')).toBeInTheDocument()
    expect(useJobMovies).toHaveBeenCalledWith(source, true)
  })

  it('reports movie errors', () => {
    useJobMovies.mockReturnValue({ error: { status: 500 }, isLoading: false })
    renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView({ jobType: 'sans' })}
        eventsConnected={false}
      />
    )
    expect(screen.getByText('Error loading movies.')).toBeInTheDocument()
  })

  it('renders nothing for job types without analysis', () => {
    renderWithProviders(
      <JobAnalysisTabs
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView({ jobType: 'multi' })}
        eventsConnected={false}
      />
    )
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
