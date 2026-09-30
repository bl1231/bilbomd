import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import { alpha, createTheme } from '@mui/material/styles'
import JobProgressCard from '../JobProgressCard'
import { durationBackground } from '../jobPageModel'
import { makeView, runningSteps } from './fixtures'

const now = new Date('2026-09-01T10:31:15Z')

const renderCard = (
  view = makeView(),
  props: Partial<{ onDownload: () => void; isDownloading: boolean }> = {}
) =>
  renderWithProviders(
    <JobProgressCard
      view={view}
      now={now}
      onDownload={props.onDownload ?? vi.fn()}
      isDownloading={props.isDownloading ?? false}
    />
  )

describe('JobProgressCard', () => {
  it('shows the running step, elapsed time and latest message', () => {
    renderCard(
      makeView({
        status: 'Running',
        progress: 42.4,
        completedAt: undefined,
        steps: runningSteps
      })
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    // Named once, on the step strip, not again in the top row
    expect(screen.getAllByText('Molecular Dynamics')).toHaveLength(1)
    expect(screen.getByTestId('step-md')).toHaveTextContent(
      'Molecular Dynamics'
    )
    expect(screen.getByText('⏱ 30m 15s')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('MD run 2 of 4')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /download results/i })
    ).not.toBeInTheDocument()
  })

  it('offers the download once the job has completed', () => {
    const onDownload = vi.fn()
    renderCard(makeView(), { onDownload })
    expect(screen.getByText('⏱ 1h 0m 0s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /download results/i }))
    expect(onDownload).toHaveBeenCalled()
  })

  it('disables the download when the archive was not built', () => {
    renderCard(makeView({ resultsReady: false }))
    expect(
      screen.getByRole('button', { name: /download results/i })
    ).toBeDisabled()
  })

  it('disables the download while one is in progress', () => {
    renderCard(makeView(), { isDownloading: true })
    expect(
      screen.getByRole('button', { name: /download results/i })
    ).toBeDisabled()
  })

  it('has no timer before the job starts', () => {
    renderCard(
      makeView({
        status: 'Submitted',
        progress: 0,
        startedAt: undefined,
        completedAt: undefined
      })
    )
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument()
  })
})

describe('durationBackground', () => {
  const light = createTheme({ palette: { mode: 'light' } })
  const dark = createTheme({ palette: { mode: 'dark' } })

  it('keeps the pale tints in light mode', () => {
    expect(durationBackground('Running', light)).toBe('#e8f5e9')
    expect(durationBackground('Failed', light)).toBe('#ffebee')
    expect(durationBackground('Submitted', light)).toBeUndefined()
  })

  it('uses translucent theme colors in dark mode', () => {
    expect(durationBackground('Completed', dark)).toBe(
      alpha(dark.palette.success.main, 0.25)
    )
    expect(durationBackground('Error', dark)).toBe(
      alpha(dark.palette.error.main, 0.25)
    )
  })
})
