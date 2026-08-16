import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import JobCardList, { JobCardRow } from '../JobCardList'

const theme = createTheme({
  palette: {
    bilbomdStatus: {
      completed: '#4caf50',
      error: '#f44336',
      running: '#ffe082',
      submitted: '#ffecb3',
      pending: '#c8e6c9',
      failed: '#e57373',
      cancelled: '#eeeeee',
      unknown: '#e0e0e0'
    },
    nerscStatus: { running: '#ffe082' }
  }
})

const makeRow = (overrides: Partial<JobCardRow> & { id: string }): JobCardRow => ({
  title: `job-${overrides.id}`,
  status: 'Completed',
  jobType: 'pdb',
  pipelineName: 'Classic',
  md_engine: 'OpenMM',
  time_submitted: new Date('2026-08-01T12:00:00Z'),
  ...overrides
})

const renderList = (rows: JobCardRow[], showUsername = false) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <JobCardList
          rows={rows}
          showUsername={showUsername}
        />
      </MemoryRouter>
    </ThemeProvider>
  )

describe('JobCardList', () => {
  it('renders a card per job linking to the job detail page', () => {
    renderList([makeRow({ id: 'abc123' })])
    expect(screen.getByText('job-abc123')).toBeInTheDocument()
    const link = screen.getByText('job-abc123').closest('a')
    expect(link).toHaveAttribute('href', '/dashboard/jobs/abc123')
  })

  it('sorts running jobs before completed ones', () => {
    renderList([
      makeRow({ id: 'done', status: 'Completed' }),
      makeRow({ id: 'active', status: 'Running', progress: 50 })
    ])
    const titles = screen
      .getAllByText(/^job-/)
      .map((el) => el.textContent)
    expect(titles).toEqual(['job-active', 'job-done'])
  })

  it('shows a progress bar only for running jobs', () => {
    renderList([
      makeRow({ id: 'active', status: 'Running', progress: 64 }),
      makeRow({ id: 'done', status: 'Completed' })
    ])
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByText('64%')).toBeInTheDocument()
  })

  it('shows the username only when showUsername is set', () => {
    const rows = [makeRow({ id: 'a', username: 'michal' })]
    const { unmount } = renderList(rows, false)
    expect(screen.queryByText(/michal/)).not.toBeInTheDocument()
    unmount()
    renderList(rows, true)
    expect(screen.getByText(/michal/)).toBeInTheDocument()
  })

  it('paginates with a load-more button', () => {
    const rows = Array.from({ length: 45 }, (_, i) =>
      makeRow({ id: `job${i}` })
    )
    renderList(rows)
    expect(screen.getAllByText(/^job-/)).toHaveLength(20)
    const loadMore = screen.getByRole('button', { name: /load 20 more/i })
    fireEvent.click(loadMore)
    expect(screen.getAllByText(/^job-/)).toHaveLength(40)
    fireEvent.click(screen.getByRole('button', { name: /load 5 more/i }))
    expect(screen.getAllByText(/^job-/)).toHaveLength(45)
    expect(screen.queryByRole('button', { name: /load/i })).not.toBeInTheDocument()
  })
})
