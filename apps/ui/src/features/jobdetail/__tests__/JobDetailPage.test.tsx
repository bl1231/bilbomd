import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobDetailPage from '../JobDetailPage'
import type { JobSource } from '../jobSource'
import type { JobView } from '../jobView'
import { makeView } from './fixtures'

const useJobView = vi.fn()
vi.mock('../useJobView', () => ({
  useJobView: (...args: unknown[]) => useJobView(...args)
}))
const download = vi.fn()
vi.mock('../useJobDownload', () => ({
  useJobDownload: () => ({
    download,
    error: null,
    clearError: vi.fn(),
    isDownloading: false
  })
}))

const { stub } = vi.hoisted(() => ({
  stub: (name: string) => ({
    default: () => <div data-testid={name} />
  })
}))
vi.mock('../JobAnalysisTabs', () => stub('analysis'))
vi.mock('../JobResultsSection', () => stub('results'))
vi.mock('../JobInputsSection', () => stub('inputs'))
vi.mock('features/molstar/Viewer', () => stub('molstar'))
vi.mock('features/scoperjob/ScoperFoXSAnalysis', () => stub('scoper-foxs'))
vi.mock('features/scoperjob/BilboMDScoperTable', () => ({
  BilboMDScoperTable: () => <div data-testid="scoper-table" />
}))

const owner: JobSource = { kind: 'owner', id: 'job-1' }
const anon: JobSource = { kind: 'public', token: 'tok' }

const renderPage = (
  source: JobSource,
  state: { view?: JobView; isLoading?: boolean; isError?: boolean }
) => {
  useJobView.mockReturnValue({
    isLoading: false,
    isError: false,
    eventsConnected: false,
    ...state
  })
  return renderWithProviders(<JobDetailPage source={source} />)
}

beforeEach(() => {
  useJobView.mockReset()
})

describe('JobDetailPage', () => {
  it('shows a spinner while loading', () => {
    renderPage(owner, { isLoading: true })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('offers owners a way back when the job cannot be loaded', () => {
    renderPage(owner, { isError: true })
    expect(screen.getByText('Job Not Found or Deleted')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /return to jobs list/i })
    ).toBeInTheDocument()
  })

  it('tells public viewers the link is bad', () => {
    renderPage(anon, { isError: true })
    expect(screen.getByText('Job Not Found')).toBeInTheDocument()
  })

  it('lays out a completed job', async () => {
    renderPage(owner, {
      view: makeView({
        results: { classic: { total_num_ensembles: 3 } } as never
      })
    })
    expect(screen.getByText('BilboMD Job')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByTestId('analysis')).toBeInTheDocument()
    expect(await screen.findByTestId('molstar')).toBeInTheDocument()
    expect(screen.getByTestId('results')).toBeInTheDocument()
    expect(screen.getByTestId('inputs')).toBeInTheDocument()
  })

  it('puts the inputs directly under the progress card', () => {
    renderPage(owner, { view: makeView() })
    const inputs = screen.getByTestId('inputs')
    const analysis = screen.getByTestId('analysis')
    const progress = screen.getByText('Progress')
    const follows = (a: Node, b: Node) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(progress, inputs)).toBe(true)
    expect(follows(inputs, analysis)).toBe(true)
    expect(follows(inputs, screen.getByTestId('results'))).toBe(true)
  })

  it('shows only progress and inputs while a job runs', () => {
    renderPage(anon, {
      view: makeView({
        status: 'Running',
        progress: 30,
        completedAt: undefined
      })
    })
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.queryByTestId('analysis')).not.toBeInTheDocument()
    expect(screen.queryByTestId('results')).not.toBeInTheDocument()
    expect(screen.getByTestId('inputs')).toBeInTheDocument()
  })

  it('keeps the results section for owners of failed jobs only', () => {
    const failed = makeView({ status: 'Error' })
    const { unmount } = renderPage(owner, { view: failed })
    expect(screen.getByTestId('results')).toBeInTheDocument()
    expect(screen.getAllByText('Job Failed').length).toBeGreaterThan(0)
    unmount()

    renderPage(anon, { view: failed })
    expect(screen.queryByTestId('results')).not.toBeInTheDocument()
  })

  it('shows the Scoper summary, and Scoper FoXS only to owners', () => {
    const scoper = makeView({
      jobType: 'scoper',
      results: { scoper: { foxs_top_file: 'x' } } as never
    })
    const { unmount } = renderPage(owner, { view: scoper })
    expect(screen.getByTestId('scoper-table')).toBeInTheDocument()
    expect(screen.getByTestId('scoper-foxs')).toBeInTheDocument()
    expect(screen.queryByTestId('analysis')).not.toBeInTheDocument()
    unmount()

    renderPage(anon, { view: scoper })
    expect(screen.getByTestId('scoper-table')).toBeInTheDocument()
    expect(screen.queryByTestId('scoper-foxs')).not.toBeInTheDocument()
  })
})
