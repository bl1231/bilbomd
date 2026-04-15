import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import NerscStatusChecker from '../NerscStatusChecker'
import { useGetNerscStatusQuery } from 'slices/nerscApiSlice'

vi.mock('slices/nerscApiSlice', () => ({
  useGetNerscStatusQuery: vi.fn()
}))

const mockUseGetNerscStatusQuery = vi.mocked(useGetNerscStatusQuery)

const baseQueryState = {
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: undefined,
  data: undefined,
  refetch: vi.fn()
}

describe('NerscStatusChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LinearProgress while loading', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isLoading: true
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders nothing when system is available', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isSuccess: true,
      data: [{ name: 'perlmutter', status: 'active', description: 'All good' }]
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders warning alert when system is unavailable', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isSuccess: true,
      data: [
        {
          name: 'perlmutter',
          status: 'unavailable',
          description: 'Scheduled maintenance'
        }
      ]
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('perlmutter')
    expect(alert).toHaveTextContent('Scheduled maintenance')
  })

  it('renders error alert for FetchBaseQueryError', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isError: true,
      error: { status: 503, data: 'Service Unavailable' }
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('503')
    expect(alert).toHaveTextContent('Service Unavailable')
  })

  it('renders error alert for SerializedError', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isError: true,
      error: { message: 'Network request failed' }
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Network request failed')
  })

  it('calls onStatusCheck(true) when system is unavailable', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isSuccess: true,
      data: [
        {
          name: 'perlmutter',
          status: 'unavailable',
          description: 'Down'
        }
      ]
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    expect(onStatusCheck).toHaveBeenCalledWith(true)
  })

  it('calls onStatusCheck(false) when system is available', () => {
    mockUseGetNerscStatusQuery.mockReturnValue({
      ...baseQueryState,
      isSuccess: true,
      data: [{ name: 'perlmutter', status: 'active', description: '' }]
    } as ReturnType<typeof useGetNerscStatusQuery>)

    const onStatusCheck = vi.fn()
    renderWithProviders(
      <NerscStatusChecker
        systemName="perlmutter"
        onStatusCheck={onStatusCheck}
      />
    )

    expect(onStatusCheck).toHaveBeenCalledWith(false)
  })
})
