import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobResultsSection from '../JobResultsSection'
import { resubmitPath } from '../jobPageModel'
import type { JobSource } from '../jobSource'
import type { JobView } from '../jobView'
import { makeView } from './fixtures'

const navigate = vi.fn()
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof import('react-router')>()),
  useNavigate: () => navigate
}))

const unwrap = vi.fn()
const deleteJob = vi.fn(() => ({ unwrap }))
vi.mock('slices/jobsApiSlice', () => ({
  useDeleteJobMutation: () => [deleteJob, { isLoading: false }]
}))

const owner: JobSource = { kind: 'owner', id: 'job-1' }
const anon: JobSource = { kind: 'public', token: 'tok' }

const renderSection = (
  source: JobSource,
  view: JobView = makeView(),
  extra: { downloadError?: string | null } = {}
) => {
  const handlers = { onDownload: vi.fn(), onClearDownloadError: vi.fn() }
  renderWithProviders(
    <JobResultsSection
      source={source}
      view={view}
      isDownloading={false}
      downloadError={extra.downloadError ?? null}
      {...handlers}
    />
  )
  return handlers
}

beforeEach(() => {
  navigate.mockReset()
  deleteJob.mockClear()
  unwrap.mockReset()
})

describe('resubmitPath', () => {
  it('maps the job types that have a resubmit form', () => {
    expect(resubmitPath(makeView({ jobType: 'pdb' }))).toBe(
      '/dashboard/jobs/classic/resubmit/job-1'
    )
    expect(resubmitPath(makeView({ jobType: 'crd' }))).toBe(
      '/dashboard/jobs/classic/resubmit/job-1'
    )
    expect(resubmitPath(makeView({ jobType: 'auto' }))).toBe(
      '/dashboard/jobs/auto/resubmit/job-1'
    )
    expect(resubmitPath(makeView({ jobType: 'alphafold' }))).toBeUndefined()
  })
})

describe('JobResultsSection', () => {
  it('gives public viewers the download only', () => {
    const { onDownload } = renderSection(anon)
    fireEvent.click(screen.getByRole('button', { name: /download results/i }))
    expect(onDownload).toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: /resubmit/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete/i })
    ).not.toBeInTheDocument()
  })

  it('lets owners resubmit', () => {
    renderSection(owner)
    fireEvent.click(screen.getByRole('button', { name: /resubmit/i }))
    expect(navigate).toHaveBeenCalledWith(
      '/dashboard/jobs/classic/resubmit/job-1'
    )
  })

  it('has no resubmit for job types without a form', () => {
    renderSection(owner, makeView({ jobType: 'scoper' }))
    expect(
      screen.queryByRole('button', { name: /resubmit/i })
    ).not.toBeInTheDocument()
  })

  it('deletes after confirmation and returns to the jobs list', async () => {
    unwrap.mockResolvedValue({})
    renderSection(owner)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(
      await screen.findByText(/are you sure you want to delete/i)
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getAllByRole('button', { name: /^delete$/i }).at(-1)!
    )
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/dashboard/jobs')
    )
    expect(deleteJob).toHaveBeenCalledWith({ id: 'job-1' })
  })

  it('stays on the page when the delete fails', async () => {
    unwrap.mockRejectedValue(new Error('nope'))
    renderSection(owner)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /^delete$/i })).at(-1)!
    )
    await waitFor(() => expect(unwrap).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('offers owners resubmit and delete, but no download, for failed jobs', () => {
    renderSection(owner, makeView({ status: 'Error' }))
    expect(
      screen.queryByRole('button', { name: /download results/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /resubmit/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('warns and disables the download when the archive failed', () => {
    renderSection(owner, makeView({ resultsReady: false }))
    expect(
      screen.getByText(/results archive packaging failed/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /download results/i })
    ).toBeDisabled()
  })

  it('shows a dismissable download error', () => {
    const { onClearDownloadError } = renderSection(anon, makeView(), {
      downloadError: 'Download failed.'
    })
    expect(screen.getByText('Download failed.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClearDownloadError).toHaveBeenCalled()
  })
})
