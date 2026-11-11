import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JobResultsDTO } from '@bilbomd/bilbomd-types'
import { renderWithProviders } from 'test/rendersWithProviders'
import { createPluginUI } from 'molstar/lib/mol-plugin-ui'
import { axiosInstance } from 'app/api/axios'
import { getWithFreshToken } from 'app/api/getWithFreshToken'
import MolstarViewer from '../Viewer'

// Molstar needs WebGL, so the plugin is a stub: these tests cover how the
// viewer fetches the model files and what it shows when that fails.
vi.mock('molstar/lib/mol-plugin-ui', () => ({ createPluginUI: vi.fn() }))
vi.mock('molstar/lib/mol-plugin-ui/skin/light.scss', () => ({}))
vi.mock('app/api/getWithFreshToken', () => ({ getWithFreshToken: vi.fn() }))
vi.mock('app/api/axios', () => ({ axiosInstance: { get: vi.fn() } }))
vi.mock('utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

const mockCreatePlugin = vi.mocked(createPluginUI)
const mockFreshGet = vi.mocked(getWithFreshToken)
const mockGet = vi.mocked(axiosInstance.get)

const results = {
  classic: { ensembles: [{ size: 1, models: [] }] }
} as unknown as JobResultsDTO

const forbidden = { isAxiosError: true, response: { status: 403 } }

const makePlugin = () => ({ dispose: vi.fn() })

beforeEach(() => {
  vi.clearAllMocks()
  window.molstar = undefined
  mockCreatePlugin.mockImplementation(
    async () =>
      makePlugin() as unknown as Awaited<ReturnType<typeof createPluginUI>>
  )
})

describe('MolstarViewer', () => {
  it('fetches owner model files through the token-refreshing GET', async () => {
    mockFreshGet.mockRejectedValue(forbidden)

    renderWithProviders(
      <MolstarViewer
        id="job-1"
        jobType="pdb"
        results={results}
      />
    )

    await waitFor(() =>
      expect(mockFreshGet).toHaveBeenCalledWith(
        expect.anything(),
        '/jobs/job-1/results/ensemble_size_1_model.pdb',
        { responseType: 'text' }
      )
    )
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('fetches public model files without a token', async () => {
    mockGet.mockRejectedValue(new Error('404'))

    renderWithProviders(
      <MolstarViewer
        id="job-1"
        jobType="pdb"
        results={results}
        isPublic
        publicId="tok"
      />
    )

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        '/public/jobs/tok/results/ensemble_size_1_model.pdb',
        { responseType: 'text' }
      )
    )
    expect(mockFreshGet).not.toHaveBeenCalled()
  })

  it('shows an error instead of a blank viewer when the models cannot be fetched', async () => {
    mockFreshGet.mockRejectedValue(forbidden)

    renderWithProviders(
      <MolstarViewer
        id="job-1"
        jobType="pdb"
        results={results}
      />
    )

    expect(
      await screen.findByText(/3D models could not be loaded/i)
    ).toBeInTheDocument()
  })

  it('starts over with a fresh plugin on Retry', async () => {
    mockFreshGet.mockRejectedValue(forbidden)

    renderWithProviders(
      <MolstarViewer
        id="job-1"
        jobType="pdb"
        results={results}
      />
    )
    await screen.findByText(/3D models could not be loaded/i)
    const firstPlugin = await mockCreatePlugin.mock.results[0]!.value

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(mockCreatePlugin).toHaveBeenCalledTimes(2))
    expect(firstPlugin.dispose).toHaveBeenCalled()
    await waitFor(() => expect(mockFreshGet).toHaveBeenCalledTimes(2))
  })
})
