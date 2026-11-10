import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BilboMdFeedback from '../BilboMdFeedback'
import { renderWithProviders } from 'test/test-utils'
import { foxsData, reportLegacy, reportMismatch, reportV2 } from './fixtures'

const useOwnerFoxs = vi.fn()
const usePublicFoxs = vi.fn()
const usePublicFeedback = vi.fn()
vi.mock('slices/jobsApiSlice', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetFoxsAnalysisByIdQuery: (...args: unknown[]) => useOwnerFoxs(...args)
}))
vi.mock('slices/publicJobsApiSlice', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetPublicFoxsDataQuery: (...args: unknown[]) => usePublicFoxs(...args),
  useGetPublicFeedbackDataQuery: (...args: unknown[]) =>
    usePublicFeedback(...args)
}))
vi.mock('../ResidualsChart', () => ({
  default: ({ points }: { points: unknown[] }) => (
    <div data-testid="residuals">{points.length} points</div>
  )
}))

const idle = { data: undefined, isLoading: false, error: undefined }

beforeEach(() => {
  useOwnerFoxs.mockReturnValue(idle)
  usePublicFoxs.mockReturnValue(idle)
  usePublicFeedback.mockReturnValue(idle)
})

describe('BilboMdFeedback', () => {
  it('leads with the verdict and the assessed model', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportV2} />)

    const verdict = screen.getByRole('alert')
    expect(within(verdict).getByText('Excellent fit (χ² 0.98)')).toBeVisible()
    expect(
      within(verdict).getByText(/Assessed: the 2-state ensemble/)
    ).toBeVisible()
  })

  it('shows the three headline tiles', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportV2} />)

    const fitTile = screen.getByText('Fit quality').parentElement!
    expect(within(fitTile).getByText('0.98')).toBeVisible()
    expect(screen.getByText('Molecular weight')).toBeVisible()
    expect(screen.getByText('59.8')).toBeVisible()
    expect(screen.getByText('Consistent')).toBeVisible()
    expect(
      screen.getByText(/SAXS estimate ≈ 48.4 kDa \(19% lower than the model\)/)
    ).toBeVisible()
    expect(screen.getByText('Data')).toBeVisible()
    expect(screen.getByText('32.8')).toBeVisible()
    expect(screen.getByText(/q from 0.009 to 0.350 Å⁻¹/)).toBeVisible()
  })

  it('lists the findings other than the verdict, with their severity', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportMismatch} />)

    const findings = screen.getByRole('list', { name: 'Findings' })
    expect(within(findings).getAllByRole('listitem')).toHaveLength(2)
    expect(within(findings).getByText(/Misfit at low q/)).toBeVisible()
    expect(within(findings).getByTitle('Problem')).toBeInTheDocument()
    expect(within(findings).getByTitle('Check')).toBeInTheDocument()
    expect(screen.getByText('Differs')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Poor fit (χ² 12.40)')
  })

  it('tabulates the q-regions from the data and the ensemble sizes', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportV2} />)

    const regions = screen.getByRole('table', { name: 'Fit by q-region' })
    expect(within(regions).getByText('0.20 – 0.35')).toBeVisible()
    expect(within(regions).getByText('294')).toBeVisible()
    // A negative mean residual is shown, not clipped at zero
    expect(within(regions).getByText('-0.04')).toBeVisible()

    const models = screen.getByRole('table', { name: 'Fit by ensemble size' })
    const rows = within(models).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[2]).toHaveTextContent('2-state ensemble')
    expect(rows[2]).toHaveTextContent('Yes')
    expect(rows[1]).not.toHaveTextContent('Yes')
  })

  it('gives each q-region its own bounds when one was skipped', () => {
    // Mid q had too few points. The shared edges in q_ranges would start
    // high q where low q ends.
    const [low, , high] = reportV2.regions!
    renderWithProviders(
      <BilboMdFeedback
        feedback={{
          ...reportV2,
          regions: [
            { ...low!, q_max: 0.09 },
            { ...high!, q_min: 0.21 }
          ],
          q_ranges: [0.0091, 0.09, 0.35]
        }}
      />
    )

    const regions = screen.getByRole('table', { name: 'Fit by q-region' })
    expect(within(regions).getAllByRole('row')).toHaveLength(3)
    expect(within(regions).getByText('0.21 – 0.35')).toBeVisible()
    expect(within(regions).queryByText('0.09 – 0.35')).not.toBeInTheDocument()
  })

  it('adds the residuals plot and χ²free / Vr once the fits load', () => {
    useOwnerFoxs.mockReturnValue({ ...idle, data: foxsData })
    renderWithProviders(
      <BilboMdFeedback
        feedback={reportV2}
        id="job-1"
      />
    )

    expect(useOwnerFoxs).toHaveBeenCalledWith('job-1', { skip: false })
    // The assessed 2-state fit has four scorable points
    expect(screen.getByTestId('residuals')).toHaveTextContent('4 points')
    expect(screen.getByText(/1\.10 · V/)).toBeVisible()
    const models = screen.getByRole('table', { name: 'Fit by ensemble size' })
    expect(within(models).getByText('0.123')).toBeVisible()
  })

  it('stands on its own when the fits are unavailable', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportV2} />)

    expect(useOwnerFoxs).toHaveBeenCalledWith('', { skip: true })
    expect(screen.queryByTestId('residuals')).not.toBeInTheDocument()
    expect(
      screen.getByText('Values near 1 mean the model fits within the errors.')
    ).toBeVisible()
  })

  it('explains how the assessment is made', async () => {
    renderWithProviders(<BilboMdFeedback feedback={reportV2} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'How this is assessed' })
    )
    expect(screen.getByText(/Rambo & Tainer, 2013/)).toBeVisible()
  })

  it('shows a report from before version 2 without its molecular weight', () => {
    renderWithProviders(<BilboMdFeedback feedback={reportLegacy} />)

    expect(screen.getByText('χ² 1.23')).toBeVisible()
    expect(screen.getByText('Not available')).toBeVisible()
    expect(screen.queryByText(/oligomerization/)).not.toBeInTheDocument()
    expect(screen.queryByText('46.6')).not.toBeInTheDocument()
    expect(
      screen.getByText(/assessed with an earlier version of the analysis/)
    ).toBeVisible()
    expect(
      screen.queryByRole('table', { name: 'Fit by ensemble size' })
    ).not.toBeInTheDocument()
  })

  it('fetches the report and the fits by token on a public page', () => {
    usePublicFeedback.mockReturnValue({ ...idle, data: reportV2 })
    usePublicFoxs.mockReturnValue({ ...idle, data: foxsData })
    renderWithProviders(<BilboMdFeedback publicId="tok" />)

    expect(usePublicFeedback).toHaveBeenCalledWith('tok', { skip: false })
    expect(usePublicFoxs).toHaveBeenCalledWith('tok', { skip: false })
    expect(useOwnerFoxs).toHaveBeenCalledWith('', { skip: true })
    expect(screen.getByText('Excellent fit (χ² 0.98)')).toBeVisible()
    expect(screen.getByTestId('residuals')).toBeInTheDocument()
  })

  it('says so when the job has no assessment', () => {
    renderWithProviders(<BilboMdFeedback />)
    expect(screen.getByText('No fit assessment for this job')).toBeVisible()
  })

  it('reports a failed request', () => {
    usePublicFeedback.mockReturnValue({ ...idle, error: { status: 500 } })
    renderWithProviders(<BilboMdFeedback publicId="tok" />)
    expect(screen.getByText('Failed to load the fit assessment.')).toBeVisible()
  })
})
